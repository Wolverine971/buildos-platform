<!-- src/lib/components/profile/CalendarTab.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import {
		Calendar,
		CheckCircle,
		Link,
		Unlink,
		Clock,
		Save,
		CalendarCheck,
		Timer,
		ChevronRight,
		Sun,
		Loader2,
		AlertCircle,
		RefreshCw
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	// Props
	export let data: any;
	export let form: any = null;

	// Create event dispatcher for parent communication
	const dispatch = createEventDispatcher();

	// State
	let calendarData: any = null;
	let loadingCalendar = false;
	let calendarPreferences: any = null;
	let isSavingCalendar = false;
	let refreshingCalendar = false;

	// Calendar timezones
	const CALENDAR_TIMEZONES = [
		'America/New_York',
		'America/Chicago',
		'America/Denver',
		'America/Los_Angeles',
		'America/Toronto',
		'Europe/London',
		'Europe/Paris',
		'Europe/Berlin',
		'Asia/Tokyo',
		'Asia/Shanghai',
		'Australia/Sydney'
	];

	// Day names for calendar
	const DAY_NAMES = [
		'Sunday',
		'Monday',
		'Tuesday',
		'Wednesday',
		'Thursday',
		'Friday',
		'Saturday'
	];

	// Handle calendar data from form actions
	$: if (form?.calendarData) {
		calendarData = form.calendarData;
		calendarPreferences = form.calendarData.calendarPreferences;
	}

	// Handle form submission results
	$: if (form?.success) {
		// Handle calendar-specific success messages
		if (form?.calendarDisconnected) {
			// Calendar was disconnected, refresh calendar data
			loadCalendarData();
		}
		dispatch('success', { message: 'Calendar settings updated successfully' });
	}

	// Handle URL parameters for success/error messages
	$: if (browser && $page.url.searchParams.get('success') === 'calendar_connected') {
		// Calendar was just connected, refresh data and show success
		refreshCalendarData();
		dispatch('success', { message: 'Google Calendar connected successfully!' });

		// Clean up URL parameters
		const newUrl = new URL($page.url);
		newUrl.searchParams.delete('success');
		replaceState(newUrl.toString(), {});
	}

	$: if (browser && $page.url.searchParams.get('error')) {
		const error = $page.url.searchParams.get('error');
		let errorMessage = 'Failed to connect Google Calendar';

		switch (error) {
			case 'access_denied':
				errorMessage = 'Access to Google Calendar was denied';
				break;
			case 'no_authorization_code':
				errorMessage = 'No authorization code received from Google';
				break;
			case 'invalid_state':
				errorMessage = 'Invalid security token. Please try again.';
				break;
			case 'token_exchange_failed':
				errorMessage = 'Failed to exchange authorization code for tokens';
				break;
			default:
				errorMessage = `Calendar connection failed: ${error}`;
		}

		dispatch('error', { message: errorMessage });

		// Clean up URL parameters
		const newUrl = new URL($page.url);
		newUrl.searchParams.delete('error');
		replaceState(newUrl.toString(), {});
	}

	// Computed values
	$: calendarConnected = calendarData?.calendarStatus?.isConnected ?? false;

	onMount(() => {
		loadCalendarData();
	});

	// Function to load calendar data
	async function loadCalendarData() {
		if (loadingCalendar) return; // Prevent multiple simultaneous loads

		loadingCalendar = true;
		try {
			const response = await fetch('/profile/calendar');

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result.error) {
				console.error('Failed to load calendar settings:', result.error);
				dispatch('error', { message: 'Failed to load calendar settings' });
				return;
			}

			calendarData = result;
			calendarPreferences = result.calendarPreferences;
		} catch (error) {
			console.error('Error loading calendar settings:', error);
			dispatch('error', { message: 'Error loading calendar settings' });
		} finally {
			loadingCalendar = false;
		}
	}

	// Function to refresh calendar data (used after OAuth or manual refresh)
	async function refreshCalendarData() {
		if (refreshingCalendar) return;

		refreshingCalendar = true;
		try {
			const response = await fetch('/profile/calendar', {
				headers: {
					'Cache-Control': 'no-cache'
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result.error) {
				console.error('Failed to refresh calendar settings:', result.error);
				dispatch('error', { message: 'Failed to refresh calendar settings' });
				return;
			}

			calendarData = result;
			calendarPreferences = result.calendarPreferences;
		} catch (error) {
			console.error('Error refreshing calendar settings:', error);
			dispatch('error', { message: 'Error refreshing calendar settings' });
		} finally {
			refreshingCalendar = false;
		}
	}

	// Calendar functions
	function connectCalendar() {
		if (calendarData?.calendarAuthUrl) {
			window.location.href = calendarData.calendarAuthUrl;
		}
	}

	function formatLastSync(dateString: string | null) {
		if (!dateString) return 'Never';
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
		if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
		return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
	}

	function formatEventDate(dateString: string) {
		const date = new Date(dateString);
		const today = new Date();
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		if (date.toDateString() === today.toDateString()) {
			return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
		} else if (date.toDateString() === tomorrow.toDateString()) {
			return `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
		} else {
			return date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			});
		}
	}
</script>

<div class="space-y-6">
	{#if loadingCalendar}
		<div class="text-center py-12">
			<Loader2 class="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
			<p class="text-gray-500 dark:text-gray-400">Loading calendar settings...</p>
		</div>
	{:else if calendarData}
		<!-- Google Calendar Integration -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
		>
			<div class="p-6 border-b border-gray-200 dark:border-gray-700">
				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-3">
						<div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
							<Calendar class="w-6 h-6 text-blue-600 dark:text-blue-400" />
						</div>
						<div>
							<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
								{#if calendarConnected}
									{calendarData.calendarStatus?.google_email ||
										'Calendar Connected'}
								{:else}
									Google Calendar Integration
								{/if}
							</h2>
							{#if !calendarConnected}
								<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
									Connect your calendar to schedule tasks automatically
								</p>
							{/if}
						</div>
					</div>

					{#if calendarConnected}
						<div class="flex items-center space-x-3">
							<div class="text-right">
								<div class="flex items-center space-x-2">
									<CheckCircle class="w-4 h-4 text-green-500" />
									<p
										class="text-sm font-medium text-green-600 dark:text-green-400"
									>
										Connected
									</p>
								</div>
								{#if calendarData.calendarStatus?.lastSync}
									<p class="text-xs text-gray-500 dark:text-gray-400">
										Last sync: {formatLastSync(
											calendarData.calendarStatus.lastSync
										)}
									</p>
								{/if}
							</div>

							<Button
								on:click={refreshCalendarData}
								disabled={refreshingCalendar}
								variant="ghost"
								size="sm"
								title="Refresh calendar data"
								icon={RefreshCw}
								loading={refreshingCalendar}
							></Button>

							<form
								method="POST"
								action="?/disconnectCalendar"
								use:enhance={() => {
									return async ({ update }) => {
										await update();
										// Refresh calendar data after disconnect
										await loadCalendarData();
									};
								}}
							>
								<Button type="submit" variant="danger" size="md" icon={Unlink}>
									Disconnect
								</Button>
							</form>
						</div>
					{:else}
						<Button on:click={connectCalendar} variant="primary" size="md" icon={Link}>
							Connect Calendar
						</Button>
					{/if}
				</div>
			</div>

			<!-- Features List -->
			<div class="p-6 bg-gray-50 dark:bg-gray-900/50">
				<h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
					Available Features with Calendar Integration:
				</h3>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div class="flex items-start space-x-2">
						<CheckCircle class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
						<div>
							<p class="text-sm font-medium text-gray-900 dark:text-white">
								Automatic Task Scheduling
							</p>
							<p class="text-xs text-gray-600 dark:text-gray-400">
								Schedule tasks in project phases directly to your calendar
							</p>
						</div>
					</div>
					<div class="flex items-start space-x-2">
						<CheckCircle class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
						<div>
							<p class="text-sm font-medium text-gray-900 dark:text-white">
								Smart Time Slots
							</p>
							<p class="text-xs text-gray-600 dark:text-gray-400">
								Find available time slots based on your preferences
							</p>
						</div>
					</div>
					<div class="flex items-start space-x-2">
						<CheckCircle class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
						<div>
							<p class="text-sm font-medium text-gray-900 dark:text-white">
								Two-way Sync
							</p>
							<p class="text-xs text-gray-600 dark:text-gray-400">
								Keep tasks and calendar events in sync automatically
							</p>
						</div>
					</div>
					<div class="flex items-start space-x-2">
						<CheckCircle class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
						<div>
							<p class="text-sm font-medium text-gray-900 dark:text-white">
								Holiday Awareness
							</p>
							<p class="text-xs text-gray-600 dark:text-gray-400">
								Automatically avoid scheduling on holidays
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Calendar Preferences -->
		{#if calendarConnected && calendarPreferences}
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
			>
				<div class="p-6 border-b border-gray-200 dark:border-gray-700">
					<h2
						class="text-xl font-semibold text-gray-900 dark:text-white flex items-center"
					>
						<Clock class="w-6 h-6 mr-2 text-blue-600 dark:text-blue-400" />
						Calendar Preferences
					</h2>
					<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
						Customize how tasks are scheduled on your calendar
					</p>
				</div>

				<form
					method="POST"
					action="?/updateCalendarPreferences"
					use:enhance={() => {
						isSavingCalendar = true;
						return async ({ update }) => {
							await update();
							isSavingCalendar = false;
							// Refresh calendar data to show updated preferences
							await refreshCalendarData();
						};
					}}
				>
					<div class="p-6 space-y-6">
						<!-- Working Hours -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
							<FormField
								label="Work Start Time"
								labelFor="workStartTime"
								required
								size="md"
							>
								<TextInput
									id="workStartTime"
									type="time"
									name="work_start_time"
									value={calendarPreferences.work_start_time}
									required
									size="md"
								/>
							</FormField>
							<FormField
								label="Work End Time"
								labelFor="workEndTime"
								required
								size="md"
							>
								<TextInput
									id="workEndTime"
									type="time"
									name="work_end_time"
									value={calendarPreferences.work_end_time}
									required
									size="md"
								/>
							</FormField>
						</div>

						<!-- Working Days -->
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
							>
								Working Days
							</label>
							<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
								{#each DAY_NAMES as day, index}
									<label class="flex items-center space-x-2 cursor-pointer">
										<input
											type="checkbox"
											name="working_days"
											value={index}
											checked={calendarPreferences.working_days.includes(
												index
											)}
											class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500
                                            dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600 cursor-pointer"
										/>
										<span class="text-sm text-gray-700 dark:text-gray-300"
											>{day}</span
										>
									</label>
								{/each}
							</div>
						</div>

						<!-- Task Duration Settings -->
						<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
							<FormField
								label="Default Duration (minutes)"
								labelFor="defaultTaskDuration"
								required
								size="md"
							>
								<TextInput
									id="defaultTaskDuration"
									type="number"
									name="default_task_duration_minutes"
									value={calendarPreferences.default_task_duration_minutes}
									min="15"
									max="480"
									required
									size="md"
								/>
							</FormField>
							<FormField
								label="Minimum Duration (minutes)"
								labelFor="minTaskDuration"
								required
								size="md"
							>
								<TextInput
									id="minTaskDuration"
									type="number"
									name="min_task_duration_minutes"
									value={calendarPreferences.min_task_duration_minutes}
									min="15"
									max="240"
									required
									size="md"
								/>
							</FormField>
							<FormField
								label="Maximum Duration (minutes)"
								labelFor="maxTaskDuration"
								required
								size="md"
							>
								<TextInput
									id="maxTaskDuration"
									type="number"
									name="max_task_duration_minutes"
									value={calendarPreferences.max_task_duration_minutes}
									min="30"
									max="480"
									required
									size="md"
								/>
							</FormField>
						</div>

						<!-- Location Settings -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
							<FormField
								required
								size="md"
								label="Timezone"
								labelFor="calendarTimezone"
							>
								<Select
									id="calendarTimezone"
									name="timezone"
									bind:value={calendarPreferences.timezone}
									on:change={(e) => (calendarPreferences.timezone = e.detail)}
									required
									size="md"
								>
									{#each CALENDAR_TIMEZONES as tz}
										<option value={tz}>{tz}</option>
									{/each}
								</Select>
							</FormField>
							<FormField
								label="Holiday Country Code"
								labelFor="holidayCountryCode"
								size="md"
							>
								<TextInput
									id="holidayCountryCode"
									type="text"
									name="holiday_country_code"
									value={calendarPreferences.holiday_country_code}
									placeholder="US"
									maxlength="2"
									class="uppercase"
									size="md"
								/>
							</FormField>
						</div>

						<!-- Additional Preferences -->
						<div class="space-y-3">
							<label class="flex items-center space-x-3 cursor-pointer">
								<input
									type="checkbox"
									name="exclude_holidays"
									checked={calendarPreferences.exclude_holidays}
									class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500
                                    dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600 cursor-pointer"
								/>
								<div>
									<span
										class="text-sm font-medium text-gray-700 dark:text-gray-300"
									>
										Exclude holidays from scheduling
									</span>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										Prevents tasks from being scheduled on national holidays
									</p>
								</div>
							</label>

							<label class="flex items-center space-x-3 cursor-pointer">
								<input
									type="checkbox"
									name="prefer_morning_for_important_tasks"
									checked={calendarPreferences.prefer_morning_for_important_tasks}
									class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500
                                    dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600 cursor-pointer"
								/>
								<div>
									<span
										class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center"
									>
										<Sun class="w-4 h-4 mr-1" />
										Schedule important tasks in the morning
									</span>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										Prioritizes morning time slots for high-priority tasks
									</p>
								</div>
							</label>
						</div>

						<!-- Save Button -->
						<div
							class="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700"
						>
							<Button
								type="submit"
								disabled={isSavingCalendar}
								loading={isSavingCalendar}
								variant="primary"
								size="md"
								icon={Save}
							>
								{isSavingCalendar ? 'Saving...' : 'Save Preferences'}
							</Button>
						</div>
					</div>
				</form>
			</div>

			<!-- Scheduled Tasks Preview -->
			{#if calendarData.scheduledTasks && calendarData.scheduledTasks.length > 0}
				<div
					class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
				>
					<div class="p-6 border-b border-gray-200 dark:border-gray-700">
						<h2
							class="text-xl font-semibold text-gray-900 dark:text-white flex items-center"
						>
							<CalendarCheck
								class="w-6 h-6 mr-2 text-green-600 dark:text-green-400"
							/>
							Scheduled Tasks
						</h2>
						<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
							Tasks currently scheduled on your calendar
						</p>
					</div>

					<div class="divide-y divide-gray-200 dark:divide-gray-700">
						{#each calendarData.scheduledTasks.slice(0, 10) as task}
							<div
								class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
							>
								<div class="flex items-center justify-between">
									<div class="flex-1">
										<h4 class="font-medium text-gray-900 dark:text-white">
											{task.title}
										</h4>
										{#if task.project}
											<p class="text-sm text-gray-600 dark:text-gray-400">
												{task.project.name}
											</p>
										{/if}
										{#if task.task_calendar_events?.[0]}
											<p
												class="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center"
											>
												<Timer class="w-3 h-3 mr-1" />
												{formatEventDate(
													task.task_calendar_events[0].event_start
												)}
											</p>
										{/if}
									</div>
									{#if task.task_calendar_events?.[0]?.event_link}
										<a
											href={task.task_calendar_events[0].event_link}
											target="_blank"
											rel="noopener noreferrer"
											class="ml-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                                            rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
										>
											<ChevronRight class="w-5 h-5" />
										</a>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					{#if calendarData.scheduledTasks.length > 10}
						<div class="p-4 bg-gray-50 dark:bg-gray-900/50 text-center">
							<p class="text-sm text-gray-600 dark:text-gray-400">
								And {calendarData.scheduledTasks.length - 10} more scheduled tasks...
							</p>
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	{:else}
		<div class="text-center py-12">
			<AlertCircle class="w-12 h-12 text-red-400 mx-auto mb-4" />
			<p class="text-gray-500 dark:text-gray-400 mb-4">
				Failed to load calendar settings. Please try again.
			</p>
			<Button on:click={loadCalendarData} variant="primary" size="sm" icon={RefreshCw}>
				Retry
			</Button>
		</div>
	{/if}
</div>
