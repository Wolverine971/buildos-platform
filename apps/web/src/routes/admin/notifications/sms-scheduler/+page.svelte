<!-- apps/web/src/routes/admin/notifications/sms-scheduler/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { format } from 'date-fns';
	import { toastService } from '$lib/stores/toast.store';
	import {
		Send,
		Calendar,
		Clock,
		Users,
		Loader2,
		AlertCircle,
		CheckCircle,
		XCircle,
		Play,
		Eye
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// Type definitions
	interface User {
		id: string;
		email: string;
		full_name?: string | null;
		name?: string | null;
		timezone?: string | null;
		sms_preferences?: {
			daily_sms_count?: number;
			daily_sms_limit?: number;
		};
	}

	interface TriggerDetail {
		user_id: string;
		timezone: string;
		lead_time_minutes: number;
		queued?: boolean;
		would_queue?: boolean;
		error?: string;
		job_data?: any;
	}

	interface TriggerResult {
		message: string;
		users_processed: number;
		jobs_queued: number;
		dry_run: boolean;
		date_override?: string;
		details: TriggerDetail[];
	}

	interface JobStatus {
		user_id: string;
		date: string;
		message_count: number;
		messages?: Array<{
			scheduled_for: string;
			event_title: string;
			message_content: string;
			status: 'pending' | 'sent' | 'failed' | 'cancelled';
		}>;
	}

	interface CalendarPreviewResult {
		user_id: string;
		user_email: string;
		user_name: string | null;
		timezone: string;
		calendar_connected: boolean;
		total_events: number;
		synced_events: number;
		events_that_would_trigger_sms: number;
		events_skipped: {
			past_reminder_time: number;
			all_day: number;
			quiet_hours: number;
			no_start_time: number;
		};
		sms_preferences: {
			event_reminders_enabled: boolean;
			phone_verified: boolean;
			daily_sms_count: number;
			daily_sms_limit: number;
			quiet_hours_start: string | null;
			quiet_hours_end: string | null;
		} | null;
		event_details: Array<{
			event_title: string;
			event_start: string;
			event_end: string | null;
			would_trigger_sms: boolean;
			skip_reason: string | null;
			reminder_time: string | null;
		}>;
		errors: string[];
	}

	// User search and selection
	let userSearch = $state('');
	let selectedUsers = $state<string[]>([]);
	let searchResults = $state<User[]>([]);
	let isSearching = $state(false);

	// Trigger options
	let dryRun = $state(true);
	let overrideDate = $state(format(new Date(), 'yyyy-MM-dd'));
	let skipQuietHours = $state(false);
	let skipDailyLimit = $state(false);

	// Status tracking
	let isTriggering = $state(false);
	let lastTriggerResult = $state<TriggerResult | null>(null);
	let jobStatuses = $state(new Map<string, JobStatus>());
	let isPolling = $state(false);
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let activeTab = $state<'trigger' | 'results' | 'monitor'>('trigger');

	// Calendar preview state
	let isLoadingCalendarPreview = $state(false);
	let calendarPreviewResults = $state<CalendarPreviewResult[]>([]);
	let showCalendarPreview = $state(false);

	// Search users
	async function searchUsers() {
		if (!userSearch.trim()) return;

		isSearching = true;
		try {
			const response = await fetch(
				`/api/admin/users?search=${encodeURIComponent(userSearch)}&limit=20`
			);
			if (response.ok) {
				const data = await response.json();
				searchResults = data.data?.users || [];
			} else {
				toastService.error('Failed to search users');
			}
		} catch (error) {
			toastService.error('Failed to search users');
			console.error('Search error:', error);
		} finally {
			isSearching = false;
		}
	}

	// Toggle user selection
	function toggleUser(userId: string) {
		if (selectedUsers.includes(userId)) {
			selectedUsers = selectedUsers.filter((id) => id !== userId);
		} else {
			selectedUsers = [...selectedUsers, userId];
		}
	}

	// Select all/none
	function selectAll() {
		selectedUsers = searchResults.map((u) => u.id);
	}

	function selectNone() {
		selectedUsers = [];
	}

	// Trigger the SMS scheduler
	async function triggerScheduler() {
		if (!dryRun && selectedUsers.length === 0) {
			toastService.error('Please select at least one user for actual execution');
			return;
		}

		isTriggering = true;
		lastTriggerResult = null;

		try {
			const response = await fetch('/api/admin/sms/daily-scheduler/trigger', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_ids: selectedUsers.length > 0 ? selectedUsers : undefined,
					dry_run: dryRun,
					override_date: overrideDate,
					skip_quiet_hours: skipQuietHours,
					skip_daily_limit: skipDailyLimit
				})
			});

			const result = await response.json();

			if (response.ok && result.success) {
				lastTriggerResult = result.data;
				toastService.success(result.data.message);
				activeTab = 'results';

				// Start polling for job status if not dry run
				if (!dryRun && result.data.jobs_queued > 0) {
					startPollingJobStatus();
				}
			} else {
				toastService.error(result.error || 'Failed to trigger scheduler');
			}
		} catch (error) {
			toastService.error('Failed to trigger SMS scheduler');
			console.error('Trigger error:', error);
		} finally {
			isTriggering = false;
		}
	}

	// Poll for job status
	function startPollingJobStatus() {
		if (isPolling) return;

		isPolling = true;
		pollJobStatus();

		// Poll every 2 seconds
		pollInterval = window.setInterval(pollJobStatus, 2000);

		// Stop polling after 30 seconds
		setTimeout(stopPollingJobStatus, 30000);
	}

	function stopPollingJobStatus() {
		isPolling = false;
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
	}

	async function pollJobStatus() {
		if (!lastTriggerResult?.details) return;

		for (const detail of lastTriggerResult.details) {
			if (detail.queued && detail.user_id) {
				try {
					const response = await fetch(
						`/api/admin/sms/daily-scheduler/trigger?user_id=${detail.user_id}&date=${overrideDate}`
					);

					if (response.ok) {
						const data = await response.json();
						jobStatuses.set(detail.user_id, data.data);
						jobStatuses = new Map(jobStatuses); // Trigger reactivity
					}
				} catch (error) {
					console.error('Failed to fetch job status:', error);
				}
			}
		}
	}

	// Load all SMS-enabled users
	async function loadAllSmsUsers() {
		isSearching = true;
		try {
			const response = await fetch('/api/admin/users?limit=100');
			if (response.ok) {
				const data = await response.json();
				// Note: filtering by SMS enabled status would need to be done after fetching
				// or the API endpoint would need to be updated to support this filter
				searchResults = data.data?.users || [];
				toastService.success(`Loaded ${searchResults.length} users`);
			} else {
				toastService.error('Failed to load users');
			}
		} catch (error) {
			toastService.error('Failed to load users');
			console.error('Load error:', error);
		} finally {
			isSearching = false;
		}
	}

	// Reset options
	function resetOptions() {
		selectedUsers = [];
		dryRun = true;
		skipQuietHours = false;
		skipDailyLimit = false;
		overrideDate = format(new Date(), 'yyyy-MM-dd');
	}

	// Fetch calendar preview
	async function fetchCalendarPreview() {
		if (selectedUsers.length === 0) {
			toastService.error('Please select at least one user to preview calendar info');
			return;
		}

		isLoadingCalendarPreview = true;
		calendarPreviewResults = [];
		showCalendarPreview = false;

		try {
			const response = await fetch(
				`/api/admin/sms/calendar-preview?user_ids=${encodeURIComponent(JSON.stringify(selectedUsers))}&date=${encodeURIComponent(overrideDate)}`
			);

			const result = await response.json();

			if (response.ok && result.success) {
				calendarPreviewResults = result.data.results;
				showCalendarPreview = true;
				toastService.success(
					`Calendar preview loaded for ${result.data.total_users} user(s)`
				);
			} else {
				toastService.error(result.error || 'Failed to fetch calendar preview');
			}
		} catch (error) {
			toastService.error('Failed to fetch calendar preview');
			console.error('Calendar preview error:', error);
		} finally {
			isLoadingCalendarPreview = false;
		}
	}

	// Lifecycle
	onMount(() => {
		loadAllSmsUsers();
		return () => stopPollingJobStatus();
	});

	// Debounce search
	let searchTimeout: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		clearTimeout(searchTimeout);
		if (userSearch.trim().length >= 2) {
			searchTimeout = setTimeout(searchUsers, 300);
		}
	});
</script>

<svelte:head>
	<title>SMS Scheduler - BuildOS Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
		<!-- Header -->
		<AdminPageHeader
			title="SMS Scheduler Manual Trigger"
			description="Manually trigger the daily SMS scheduling job that runs at 12:00 AM UTC"
			icon={Calendar}
			showBack={true}
		/>

		<!-- Info Alert -->
		<div
			class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6"
		>
			<div class="flex items-start">
				<AlertCircle
					class="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3 flex-shrink-0"
				/>
				<div class="text-sm text-blue-800 dark:text-blue-200">
					This tool manually triggers the daily SMS scheduling job that normally runs at
					12:00 AM UTC. The same code flow is executed, but you can override settings for
					testing.
				</div>
			</div>
		</div>

		<!-- Tabs -->
		<div class="border-b border-gray-200 dark:border-gray-700 mb-6">
			<nav class="-mb-px flex space-x-8">
				<button
					onclick={() => (activeTab = 'trigger')}
					class="py-2 px-1 border-b-2 font-medium text-sm transition-colors
						{activeTab === 'trigger'
						? 'border-blue-500 text-blue-600 dark:text-blue-400'
						: 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
				>
					<div class="flex items-center">
						<Send class="h-4 w-4 mr-2" />
						Trigger Settings
					</div>
				</button>
				<button
					onclick={() => (activeTab = 'results')}
					class="py-2 px-1 border-b-2 font-medium text-sm transition-colors
						{activeTab === 'results'
						? 'border-blue-500 text-blue-600 dark:text-blue-400'
						: 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
				>
					<div class="flex items-center">
						<CheckCircle class="h-4 w-4 mr-2" />
						Last Results
					</div>
				</button>
				<button
					onclick={() => (activeTab = 'monitor')}
					class="py-2 px-1 border-b-2 font-medium text-sm transition-colors
						{activeTab === 'monitor'
						? 'border-blue-500 text-blue-600 dark:text-blue-400'
						: 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
				>
					<div class="flex items-center">
						<Eye class="h-4 w-4 mr-2" />
						Job Monitor
					</div>
				</button>
			</nav>
		</div>

		<!-- Tab Content -->
		{#if activeTab === 'trigger'}
			<div class="space-y-6">
				<!-- User Selection -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<h3
						class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center"
					>
						<Users class="h-5 w-5 mr-2" />
						User Selection
					</h3>

					<!-- Search -->
					<div class="flex gap-2 mb-4">
						<input
							type="text"
							placeholder="Search users by email or name..."
							bind:value={userSearch}
							onkeydown={(e) => e.key === 'Enter' && searchUsers()}
							class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
								focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
						/>
						<Button onclick={searchUsers} disabled={isSearching} variant="ghost">
							{#if isSearching}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								Search
							{/if}
						</Button>
						<Button onclick={loadAllSmsUsers} variant="ghost">
							Load All SMS Users
						</Button>
					</div>

					<!-- Results -->
					{#if searchResults.length > 0}
						<div
							class="border dark:border-gray-700 rounded-lg p-4 max-h-64 overflow-y-auto"
						>
							<div class="flex items-center justify-between mb-2">
								<div class="text-sm text-gray-600 dark:text-gray-400">
									{selectedUsers.length} of {searchResults.length} users selected
								</div>
								<div class="flex gap-2">
									<Button size="sm" variant="ghost" onclick={selectAll}>
										Select All
									</Button>
									<Button size="sm" variant="ghost" onclick={selectNone}>
										Clear
									</Button>
								</div>
							</div>
							{#each searchResults as user}
								<label
									class="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"
								>
									<input
										type="checkbox"
										checked={selectedUsers.includes(user.id)}
										onchange={() => toggleUser(user.id)}
										class="h-4 w-4 rounded border-gray-300 text-blue-600"
									/>
									<div class="flex-1">
										<div
											class="font-medium text-sm text-gray-900 dark:text-white"
										>
											{user.email}
										</div>
										<div class="text-xs text-gray-500">
											{user.name || user.full_name || 'No name'} · {user.timezone ||
												'UTC'}
										</div>
									</div>
									{#if user.sms_preferences}
										<div
											class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
										>
											{user.sms_preferences.daily_sms_count || 0}/{user
												.sms_preferences.daily_sms_limit || 10} today
										</div>
									{/if}
								</label>
							{/each}
						</div>
					{/if}

					{#if selectedUsers.length > 0}
						<div
							class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
						>
							<div class="text-sm text-blue-800 dark:text-blue-200">
								{selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected.
								Leave empty to process ALL SMS-enabled users.
							</div>
						</div>
					{/if}
				</div>

				<!-- Trigger Options -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<h3
						class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center"
					>
						<Clock class="h-5 w-5 mr-2" />
						Trigger Options
					</h3>

					<div class="space-y-4">
						<!-- Dry Run -->
						<label class="flex items-start gap-3">
							<input
								type="checkbox"
								bind:checked={dryRun}
								class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
							/>
							<div>
								<div class="font-medium text-gray-900 dark:text-white">Dry Run</div>
								<div class="text-sm text-gray-500">
									Preview what would happen without actually queueing jobs
								</div>
							</div>
						</label>

						<!-- Date Override -->
						<div>
							<label
								for="override-date"
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>
								Override Date
							</label>
							<input
								id="override-date"
								type="date"
								bind:value={overrideDate}
								class="w-64 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
									focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
							/>
							<p class="text-sm text-gray-500 mt-1">
								Process calendar events for this date (user's timezone)
							</p>
						</div>

						<!-- Skip Quiet Hours -->
						<label class="flex items-start gap-3">
							<input
								type="checkbox"
								bind:checked={skipQuietHours}
								class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
							/>
							<div>
								<div class="font-medium text-gray-900 dark:text-white">
									Skip Quiet Hours Check
								</div>
								<div class="text-sm text-gray-500">
									Send messages even during user's quiet hours (testing only)
								</div>
							</div>
						</label>

						<!-- Skip Daily Limit -->
						<label class="flex items-start gap-3">
							<input
								type="checkbox"
								bind:checked={skipDailyLimit}
								class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
							/>
							<div>
								<div class="font-medium text-gray-900 dark:text-white">
									Skip Daily SMS Limit
								</div>
								<div class="text-sm text-gray-500">
									Ignore user's daily SMS limit (testing only)
								</div>
							</div>
						</label>

						<!-- Calendar Preview Button -->
						<div class="pt-4 border-t dark:border-gray-700">
							<Button
								onclick={fetchCalendarPreview}
								disabled={isLoadingCalendarPreview || selectedUsers.length === 0}
								variant="secondary"
								class="w-full"
							>
								{#if isLoadingCalendarPreview}
									<Loader2 class="h-4 w-4 mr-2 animate-spin" />
									Loading Calendar Info...
								{:else}
									<Calendar class="h-4 w-4 mr-2" />
									Check Calendar Info for Selected Users
								{/if}
							</Button>
							{#if selectedUsers.length === 0}
								<p
									class="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center"
								>
									Select users above to check their calendar info
								</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- Calendar Preview Results -->
				{#if showCalendarPreview && calendarPreviewResults.length > 0}
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
						<div class="flex items-center justify-between mb-4">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Calendar Preview Results
							</h3>
							<button
								onclick={() => (showCalendarPreview = false)}
								class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
							>
								<XCircle class="h-5 w-5" />
							</button>
						</div>

						<div class="space-y-4">
							{#each calendarPreviewResults as result}
								<div
									class="border dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
								>
									<!-- User Header -->
									<div class="flex items-start justify-between mb-3">
										<div>
											<div class="font-medium text-gray-900 dark:text-white">
												{result.user_email}
											</div>
											{#if result.user_name}
												<div
													class="text-sm text-gray-500 dark:text-gray-400"
												>
													{result.user_name}
												</div>
											{/if}
											<div
												class="text-xs text-gray-500 dark:text-gray-400 mt-1"
											>
												Timezone: {result.timezone}
											</div>
										</div>
										<div class="flex gap-2">
											{#if result.calendar_connected}
												<span
													class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
												>
													<CheckCircle class="h-3 w-3 mr-1" />
													Calendar Connected
												</span>
											{:else}
												<span
													class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
												>
													<XCircle class="h-3 w-3 mr-1" />
													No Calendar
												</span>
											{/if}
										</div>
									</div>

									<!-- Stats Grid -->
									{#if result.calendar_connected}
										<div class="grid grid-cols-4 gap-3 mb-3">
											<div class="bg-gray-50 dark:bg-gray-800 p-3 rounded">
												<div
													class="text-xs text-gray-600 dark:text-gray-400"
												>
													Total Events
												</div>
												<div
													class="text-lg font-semibold text-gray-900 dark:text-white"
												>
													{result.total_events}
												</div>
											</div>
											<div class="bg-gray-50 dark:bg-gray-800 p-3 rounded">
												<div
													class="text-xs text-gray-600 dark:text-gray-400"
												>
													Synced Events
												</div>
												<div
													class="text-lg font-semibold text-gray-900 dark:text-white"
												>
													{result.synced_events}
												</div>
											</div>
											<div
												class="bg-green-50 dark:bg-green-900/20 p-3 rounded"
											>
												<div
													class="text-xs text-green-600 dark:text-green-400 font-medium"
												>
													Would Trigger SMS
												</div>
												<div
													class="text-lg font-semibold text-green-700 dark:text-green-400"
												>
													{result.events_that_would_trigger_sms}
												</div>
											</div>
											<div class="bg-gray-50 dark:bg-gray-800 p-3 rounded">
												<div
													class="text-xs text-gray-600 dark:text-gray-400"
												>
													SMS Usage
												</div>
												<div
													class="text-lg font-semibold text-gray-900 dark:text-white"
												>
													{result.sms_preferences?.daily_sms_count ||
														0}/{result.sms_preferences
														?.daily_sms_limit || 10}
												</div>
											</div>
										</div>

										<!-- Events Skipped -->
										{#if result.events_skipped.past_reminder_time > 0 || result.events_skipped.all_day > 0 || result.events_skipped.quiet_hours > 0 || result.events_skipped.no_start_time > 0}
											<div class="mb-3">
												<div
													class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
												>
													Events Skipped:
												</div>
												<div class="flex flex-wrap gap-2">
													{#if result.events_skipped.past_reminder_time > 0}
														<span
															class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
														>
															Past time: {result.events_skipped
																.past_reminder_time}
														</span>
													{/if}
													{#if result.events_skipped.all_day > 0}
														<span
															class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
														>
															All-day: {result.events_skipped.all_day}
														</span>
													{/if}
													{#if result.events_skipped.quiet_hours > 0}
														<span
															class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
														>
															Quiet hours: {result.events_skipped
																.quiet_hours}
														</span>
													{/if}
													{#if result.events_skipped.no_start_time > 0}
														<span
															class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
														>
															No start time: {result.events_skipped
																.no_start_time}
														</span>
													{/if}
												</div>
											</div>
										{/if}

										<!-- Event Details -->
										{#if result.event_details.length > 0}
											<details class="mt-3">
												<summary
													class="text-sm font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
												>
													View {result.event_details.length} Event Details
												</summary>
												<div
													class="mt-2 space-y-2 max-h-64 overflow-y-auto"
												>
													{#each result.event_details as event}
														<div
															class="text-sm p-2 rounded {event.would_trigger_sms
																? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
																: 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}"
														>
															<div
																class="flex items-start justify-between gap-2"
															>
																<div class="flex-1">
																	<div
																		class="font-medium text-gray-900 dark:text-white"
																	>
																		{event.event_title}
																	</div>
																	<div
																		class="text-xs text-gray-500 dark:text-gray-400"
																	>
																		{format(
																			new Date(
																				event.event_start
																			),
																			'MMM d, yyyy h:mm a'
																		)}
																	</div>
																	{#if event.reminder_time}
																		<div
																			class="text-xs text-green-600 dark:text-green-400"
																		>
																			SMS would send at: {format(
																				new Date(
																					event.reminder_time
																				),
																				'h:mm a'
																			)}
																		</div>
																	{/if}
																</div>
																<div>
																	{#if event.would_trigger_sms}
																		<CheckCircle
																			class="h-4 w-4 text-green-600 dark:text-green-400"
																		/>
																	{:else}
																		<span
																			class="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded"
																		>
																			{event.skip_reason}
																		</span>
																	{/if}
																</div>
															</div>
														</div>
													{/each}
												</div>
											</details>
										{/if}
									{/if}

									<!-- Errors -->
									{#if result.errors.length > 0}
										<div class="mt-3">
											{#each result.errors as error}
												<div
													class="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded"
												>
													⚠️ {error}
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex justify-end gap-4">
					<Button variant="ghost" onclick={resetOptions}>Reset Options</Button>
					<Button
						onclick={triggerScheduler}
						disabled={isTriggering}
						variant={dryRun ? 'secondary' : 'primary'}
						icon={Play}
						loading={isTriggering}
					>
						{#if isTriggering}
							Triggering...
						{:else if dryRun}
							Run Dry Test
						{:else}
							Execute Trigger
						{/if}
					</Button>
				</div>
			</div>
		{:else if activeTab === 'results'}
			<!-- Results Tab -->
			{#if lastTriggerResult}
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Trigger Results
					</h3>

					<!-- Summary -->
					<div class="grid grid-cols-3 gap-4 mb-6">
						<div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
							<div class="text-sm text-gray-600 dark:text-gray-400">Mode</div>
							<div class="text-lg font-semibold text-gray-900 dark:text-white">
								{lastTriggerResult.dry_run ? 'Dry Run' : 'Executed'}
							</div>
						</div>
						<div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
							<div class="text-sm text-gray-600 dark:text-gray-400">
								Users Processed
							</div>
							<div class="text-lg font-semibold text-gray-900 dark:text-white">
								{lastTriggerResult.users_processed}
							</div>
						</div>
						<div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
							<div class="text-sm text-gray-600 dark:text-gray-400">Jobs Queued</div>
							<div class="text-lg font-semibold text-gray-900 dark:text-white">
								{lastTriggerResult.jobs_queued || 0}
							</div>
						</div>
					</div>

					<!-- Details -->
					{#if lastTriggerResult.details?.length > 0}
						<div>
							<h4 class="font-medium text-gray-900 dark:text-white mb-2">
								User Details
							</h4>
							<div class="border dark:border-gray-700 rounded-lg overflow-hidden">
								<table class="w-full text-sm">
									<thead class="bg-gray-50 dark:bg-gray-700">
										<tr>
											<th
												class="text-left p-3 font-medium text-gray-700 dark:text-gray-300"
											>
												User ID
											</th>
											<th
												class="text-left p-3 font-medium text-gray-700 dark:text-gray-300"
											>
												Timezone
											</th>
											<th
												class="text-left p-3 font-medium text-gray-700 dark:text-gray-300"
											>
												Lead Time
											</th>
											<th
												class="text-left p-3 font-medium text-gray-700 dark:text-gray-300"
											>
												Status
											</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-200 dark:divide-gray-700">
										{#each lastTriggerResult.details as detail}
											<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
												<td
													class="p-3 font-mono text-xs text-gray-900 dark:text-white"
												>
													{detail.user_id.slice(0, 8)}...
												</td>
												<td class="p-3 text-gray-900 dark:text-white">
													{detail.timezone}
												</td>
												<td class="p-3 text-gray-900 dark:text-white">
													{detail.lead_time_minutes} min
												</td>
												<td class="p-3">
													{#if detail.queued}
														<span
															class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
														>
															<CheckCircle class="h-3 w-3 mr-1" />
															Queued
														</span>
													{:else if detail.would_queue}
														<span
															class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400"
														>
															Would Queue
														</span>
													{:else if detail.error}
														<span
															class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
														>
															<XCircle class="h-3 w-3 mr-1" />
															Failed
														</span>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
					<AlertCircle class="h-12 w-12 text-gray-400 mx-auto mb-4" />
					<p class="text-gray-600 dark:text-gray-400">
						No trigger results yet. Run a trigger to see results here.
					</p>
				</div>
			{/if}
		{:else if activeTab === 'monitor'}
			<!-- Monitor Tab -->
			{#if jobStatuses.size > 0}
				<div class="space-y-4">
					{#each Array.from(jobStatuses.entries()) as [userId, status]}
						<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
							<div class="flex items-start justify-between mb-3">
								<div>
									<div class="font-mono text-xs text-gray-500 dark:text-gray-400">
										User: {userId.slice(0, 8)}...
									</div>
									<div class="text-sm font-medium text-gray-900 dark:text-white">
										{status.message_count} message{status.message_count !== 1
											? 's'
											: ''} scheduled
									</div>
								</div>
								{#if isPolling}
									<span
										class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 animate-pulse"
									>
										<Loader2 class="h-3 w-3 mr-1 animate-spin" />
										Polling...
									</span>
								{/if}
							</div>

							{#if status.messages && status.messages.length > 0}
								<div class="border dark:border-gray-700 rounded-lg overflow-hidden">
									<table class="w-full text-xs">
										<thead class="bg-gray-50 dark:bg-gray-700">
											<tr>
												<th class="text-left p-2 font-medium">Time</th>
												<th class="text-left p-2 font-medium">Event</th>
												<th class="text-left p-2 font-medium">Message</th>
												<th class="text-left p-2 font-medium">Status</th>
											</tr>
										</thead>
										<tbody
											class="divide-y divide-gray-200 dark:divide-gray-700"
										>
											{#each status.messages as msg}
												<tr>
													<td class="p-2">
														{format(
															new Date(msg.scheduled_for),
															'HH:mm'
														)}
													</td>
													<td class="p-2 max-w-[200px] truncate">
														{msg.event_title}
													</td>
													<td class="p-2 max-w-[300px] truncate">
														{msg.message_content}
													</td>
													<td class="p-2">
														<span
															class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium
															{msg.status === 'sent'
																? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
																: msg.status === 'failed'
																	? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
																	: msg.status === 'cancelled'
																		? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
																		: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'}"
														>
															{msg.status}
														</span>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					{/each}
				</div>

				{#if isPolling}
					<div class="flex justify-center mt-4">
						<Button variant="ghost" onclick={stopPollingJobStatus}>Stop Polling</Button>
					</div>
				{/if}
			{:else}
				<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
					<Eye class="h-12 w-12 text-gray-400 mx-auto mb-4" />
					<p class="text-gray-600 dark:text-gray-400">
						No jobs being monitored. Execute a trigger (not dry run) to see live job
						status.
					</p>
				</div>
			{/if}
		{/if}
	</div>
</div>
