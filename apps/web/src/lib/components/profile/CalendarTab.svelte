<!-- apps/web/src/lib/components/profile/CalendarTab.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import {
		Calendar,
		CircleCheck,
		Link,
		Unlink,
		Clock,
		Save,
		CalendarCheck,
		Timer,
		ChevronRight,
		Sun,
		LoaderCircle,
		CircleAlert,
		RefreshCw,
		Brain,
		Sparkles,
		FolderOpen,
		ExternalLink
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import CalendarAnalysisModal from '$lib/components/calendar/CalendarAnalysisModal.svelte';
	import { startCalendarAnalysis as startCalendarAnalysisNotification } from '$lib/services/calendar-analysis-notification.bridge';
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import { supabase } from '$lib/supabase';
	import CalendarDisconnectModal from '$lib/components/calendar/CalendarDisconnectModal.svelte';
	import { CalendarDisconnectService } from '$lib/services/calendar-disconnect-service';
	import { invalidate } from '$app/navigation';
	import TabHeader from './_shared/TabHeader.svelte';
	import SettingsCard from './_shared/SettingsCard.svelte';
	import CheckboxField from './_shared/CheckboxField.svelte';

	// Props
	interface Props {
		data: any;
		form?: any;
		onsuccess?: (event: { message: string }) => void;
		onerror?: (event: { message: string }) => void;
	}

	let { data, form = null, onsuccess, onerror }: Props = $props();

	// State
	let calendarData = $state<any>(null);
	let loadingCalendar = $state(false);
	let calendarPreferences = $state<any>(null);
	let isSavingCalendar = $state(false);
	let refreshingCalendar = $state(false);
	let showAnalysisModal = $state(false);
	let analysisInProgress = $state(false);
	let calendarAnalysisHistory = $state<any[]>([]);
	let calendarProjects = $state<any[]>([]);
	let showDisconnectModal = $state(false);
	let calendarDependencies = $state<any>(null);
	let checkingDependencies = $state(false);
	let disconnecting = $state(false);

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

	// Ensure required string fields bound to form inputs always have a value.
	// The Select component has a fallback `value = $bindable('')`, and Svelte 5
	// forbids `bind:value={undefined}` against a prop with a fallback.
	function normalizeCalendarPreferences(prefs: any) {
		if (!prefs) return prefs;
		if (!prefs.timezone) prefs.timezone = 'America/New_York';
		return prefs;
	}

	function getCalendarReturnPath() {
		const returnUrl = new URL($page.url);
		returnUrl.searchParams.set('tab', 'calendar');
		returnUrl.searchParams.set('calendar', '1');
		returnUrl.searchParams.delete('success');
		returnUrl.searchParams.delete('error');
		return `${returnUrl.pathname}${returnUrl.search}`;
	}

	function getCalendarSettingsUrl() {
		const params = new URLSearchParams({ redirect: getCalendarReturnPath() });
		return `/profile/calendar?${params.toString()}`;
	}

	// Handle calendar data from form actions
	$effect(() => {
		if (form?.calendarData) {
			calendarData = form.calendarData;
			calendarPreferences = normalizeCalendarPreferences(
				form.calendarData.calendarPreferences
			);
		}
	});

	// Handle form submission results
	$effect(() => {
		if (form?.success) {
			// Handle calendar-specific success messages
			if (form?.calendarDisconnected && browser) {
				// Calendar was disconnected, refresh calendar data
				loadCalendarData();
			}
			onsuccess?.({ message: 'Calendar settings updated successfully' });
		}
	});

	// Consolidated URL parameter handling — one effect branches per param.
	// Original behaviors preserved:
	//  1) calendar=1 & success=calendar_connected → refresh, fire success, maybe show analysis modal, strip both params
	//  2) analyze=true → start analysis, strip analyze param
	//  3) calendar=1 & error=<code> → emit error, strip both params
	$effect(() => {
		if (!browser) return;

		const params = $page.url.searchParams;
		const calendarFlag = params.get('calendar') === '1';
		const success = params.get('success');
		const errorCode = params.get('error');
		const analyzeFlag = params.get('analyze') === 'true';

		if (!calendarFlag && !analyzeFlag) return;

		// (1) Calendar connected success path
		if (calendarFlag && success === 'calendar_connected') {
			refreshCalendarData({ showErrors: false });
			onsuccess?.({ message: 'Google Calendar connected successfully!' });

			const hasShownAnalysis =
				localStorage.getItem('calendar_analysis_requested') ||
				localStorage.getItem('calendar_analysis_skipped');

			if (!hasShownAnalysis) {
				showAnalysisModal = true;
			}

			const newUrl = new URL($page.url);
			newUrl.searchParams.delete('success');
			newUrl.searchParams.delete('calendar');
			replaceState(newUrl.toString(), {});
			return;
		}

		// (3) Calendar connection error path
		if (calendarFlag && errorCode) {
			let errorMessage = 'Failed to connect Google Calendar';

			switch (errorCode) {
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
					errorMessage = `Calendar connection failed: ${errorCode}`;
			}

			onerror?.({ message: errorMessage });

			const newUrl = new URL($page.url);
			newUrl.searchParams.delete('error');
			newUrl.searchParams.delete('calendar');
			replaceState(newUrl.toString(), {});
			return;
		}

		// (2) Analyze deep-link path
		if (analyzeFlag) {
			startCalendarAnalysis();
			const newUrl = new URL($page.url);
			newUrl.searchParams.delete('analyze');
			replaceState(newUrl.toString(), {});
		}
	});

	// Computed values
	let calendarConnected = $derived(calendarData?.calendarStatus?.isConnected ?? false);
	let scheduledTasksPreview = $derived(
		(calendarData?.scheduledTasks ?? []).slice(0, 10) as any[]
	);

	onMount(() => {
		loadCalendarData();
		if (calendarConnected) {
			loadCalendarAnalysisHistory();
		}
	});

	// Function to load calendar data
	async function loadCalendarData() {
		if (loadingCalendar) return; // Prevent multiple simultaneous loads

		loadingCalendar = true;
		try {
			const response = await fetch(getCalendarSettingsUrl());

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result.error) {
				console.error('Failed to load calendar settings:', result.error);
				onerror?.({ message: 'Failed to load calendar settings' });
				return;
			}

			calendarData = result;
			calendarPreferences = normalizeCalendarPreferences(result.calendarPreferences);

			// Also load analysis history if connected
			if (result.calendarStatus?.isConnected) {
				loadCalendarAnalysisHistory();
			}
		} catch (error) {
			console.error('Error loading calendar settings:', error);
			onerror?.({ message: 'Error loading calendar settings' });
		} finally {
			loadingCalendar = false;
		}
	}

	// Function to refresh calendar data (used after OAuth or manual refresh)
	async function refreshCalendarData(options: { showErrors?: boolean } = {}) {
		if (refreshingCalendar) return;

		const { showErrors = true } = options;
		refreshingCalendar = true;
		try {
			const response = await fetch(getCalendarSettingsUrl(), {
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
				if (showErrors) onerror?.({ message: 'Failed to refresh calendar settings' });
				return;
			}

			calendarData = result;
			calendarPreferences = normalizeCalendarPreferences(result.calendarPreferences);
		} catch (error) {
			console.error('Error refreshing calendar settings:', error);
			if (showErrors) onerror?.({ message: 'Error refreshing calendar settings' });
		} finally {
			refreshingCalendar = false;
		}
	}

	// Calendar functions
	async function connectCalendar() {
		try {
			let calendarAuthUrl = calendarData?.calendarAuthUrl;
			if (!calendarAuthUrl) {
				const response = await fetch(getCalendarSettingsUrl());
				if (!response.ok) {
					throw new Error('Failed to get calendar authorization URL');
				}

				const result = await response.json();
				calendarAuthUrl = result.calendarAuthUrl;
			}

			if (!calendarAuthUrl) {
				throw new Error('No calendar authorization URL returned');
			}

			window.location.href = calendarAuthUrl;
		} catch (error) {
			console.error('Calendar connection error:', error);
			onerror?.({
				message:
					error instanceof Error ? error.message : 'Failed to connect Google Calendar'
			});
		}
	}

	function formatRelative(dateString: string | null, options: { extendedDate?: boolean } = {}) {
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
		if (options.extendedDate) {
			if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
			return date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		}
		return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
	}

	function formatLastSync(dateString: string | null) {
		return formatRelative(dateString);
	}

	function formatRelativeTime(dateString: string | null) {
		return formatRelative(dateString, { extendedDate: true });
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

	// Calendar Analysis functions
	async function startCalendarAnalysis() {
		if (analysisInProgress) return;

		analysisInProgress = true;
		try {
			const { completion } = await startCalendarAnalysisNotification({
				daysBack: 7,
				daysForward: 60,
				expandOnStart: true,
				expandOnComplete: true
			});

			await completion;
			await loadCalendarAnalysisHistory();
		} catch (error) {
			console.error('Failed to start calendar analysis', error);
			toastService.error('Failed to initiate calendar analysis');
		} finally {
			analysisInProgress = false;
		}
	}

	async function loadCalendarAnalysisHistory() {
		try {
			const response = await fetch('/api/calendar/analyze');
			if (!response.ok) return;

			const result = await response.json();

			if (result.success && result.data) {
				// The API returns { history, calendarProjects }
				calendarAnalysisHistory = result.data.history || [];
				calendarProjects = result.data.calendarProjects || [];
			}
		} catch (error) {
			console.error('Error loading calendar analysis history:', error);
		}
	}

	// Handle disconnect button click
	async function handleDisconnectClick() {
		checkingDependencies = true;
		try {
			if (!supabase) {
				toastService.error('Unable to access database');
				return;
			}
			const service = new CalendarDisconnectService(supabase);
			calendarDependencies = await service.checkCalendarDependencies(data.user.id);

			if (calendarDependencies.totalAffectedItems > 0) {
				// Show modal if there are dependencies
				showDisconnectModal = true;
			} else {
				// No dependencies, disconnect directly
				await disconnectCalendar(false);
			}
		} catch (error) {
			console.error('Error checking calendar dependencies:', error);
			toastService.error('Failed to check calendar data');
		} finally {
			checkingDependencies = false;
		}
	}

	// Handle disconnect modal confirmation
	async function handleDisconnectConfirm(event: { action: string }) {
		const { action } = event;
		showDisconnectModal = false;

		// Disconnect calendar with data removal option
		await disconnectCalendar(action === 'remove');
	}

	// Perform the actual disconnect
	async function disconnectCalendar(removeData: boolean) {
		disconnecting = true;
		try {
			if (!supabase) {
				toastService.error('Unable to access database');
				return;
			}

			// If removeData is true, remove calendar data first
			if (removeData) {
				const service = new CalendarDisconnectService(supabase);
				await service.removeCalendarData(data.user.id);
			}

			// Submit the disconnect form action
			const formData = new FormData();
			formData.append('removeData', removeData.toString());

			const response = await fetch('?/disconnectCalendar', {
				method: 'POST',
				body: formData
			});

			if (response.ok) {
				await loadCalendarData();
				toastService.success(
					removeData
						? 'Calendar disconnected and all data removed'
						: 'Calendar disconnected successfully'
				);
				// Force refresh the page data
				await invalidate('profile:calendar');
			} else {
				throw new Error('Failed to disconnect calendar');
			}
		} catch (error) {
			console.error('Error disconnecting calendar:', error);
			toastService.error('Failed to disconnect calendar');
		} finally {
			disconnecting = false;
		}
	}
</script>

<div class="space-y-4 sm:space-y-5">
	<TabHeader
		icon={Calendar}
		title="Calendar"
		description="Connect Google Calendar and configure scheduling preferences."
	/>

	{#if loadingCalendar}
		<div class="text-center py-12">
			<LoaderCircle
				class="w-8 h-8 animate-spin motion-reduce:animate-none text-accent mx-auto mb-4"
			/>
			<p class="text-sm text-muted-foreground">Loading calendar settings...</p>
		</div>
	{:else if calendarData}
		<!-- Google Calendar Integration -->
		<SettingsCard
			icon={Calendar}
			title={calendarConnected
				? calendarData.calendarStatus?.google_email || 'Calendar Connected'
				: 'Google Calendar'}
			description={calendarConnected ? '' : 'Connect to schedule tasks automatically'}
			labelledById="calendar-integration-heading"
			bodyClass="bg-muted/50"
		>
			{#snippet actions()}
				{#if calendarConnected}
					<div class="flex items-center gap-1.5 text-xs">
						<CircleCheck class="w-3.5 h-3.5 text-success" />
						<span class="font-medium text-success">Connected</span>
						{#if calendarData.calendarStatus?.lastSync}
							<span class="text-muted-foreground">
								· Last sync {formatLastSync(calendarData.calendarStatus.lastSync)}
							</span>
						{/if}
					</div>

					<Button
						onclick={() => refreshCalendarData()}
						disabled={refreshingCalendar}
						variant="ghost"
						size="sm"
						title="Refresh calendar data"
						aria-label="Refresh calendar"
						icon={RefreshCw}
						loading={refreshingCalendar}
					></Button>

					<Button
						onclick={handleDisconnectClick}
						variant="danger"
						size="sm"
						icon={Unlink}
						disabled={checkingDependencies || disconnecting}
						loading={checkingDependencies || disconnecting}
					>
						Disconnect
					</Button>
				{:else}
					<Button
						onclick={connectCalendar}
						variant="primary"
						size="sm"
						icon={Link}
						class="shadow-ink pressable"
					>
						Connect Calendar
					</Button>
				{/if}
			{/snippet}

			<!-- Features List -->
			<h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
				Calendar Features
			</h4>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
				<div class="flex items-start gap-2">
					<CircleCheck class="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
					<div class="min-w-0">
						<p class="text-xs sm:text-sm font-medium text-foreground">
							Automatic Task Scheduling
						</p>
						<p class="text-xs text-muted-foreground">
							Schedule tasks directly to your calendar
						</p>
					</div>
				</div>
				<div class="flex items-start gap-2">
					<CircleCheck class="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
					<div class="min-w-0">
						<p class="text-xs sm:text-sm font-medium text-foreground">
							Smart Time Slots
						</p>
						<p class="text-xs text-muted-foreground">
							Find slots based on your preferences
						</p>
					</div>
				</div>
				<div class="flex items-start gap-2">
					<CircleCheck class="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
					<div class="min-w-0">
						<p class="text-xs sm:text-sm font-medium text-foreground">Two-way Sync</p>
						<p class="text-xs text-muted-foreground">
							Tasks and calendar events stay in sync
						</p>
					</div>
				</div>
				<div class="flex items-start gap-2">
					<CircleCheck class="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
					<div class="min-w-0">
						<p class="text-xs sm:text-sm font-medium text-foreground">
							Holiday Awareness
						</p>
						<p class="text-xs text-muted-foreground">Avoid scheduling on holidays</p>
					</div>
				</div>
			</div>
		</SettingsCard>

		<!-- Calendar Preferences -->
		{#if calendarConnected && calendarPreferences}
			<SettingsCard
				icon={Clock}
				title="Calendar Preferences"
				description="Customize how tasks are scheduled"
				labelledById="calendar-preferences-heading"
				bodyClass="p-0"
			>
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
					<div class="p-4 sm:p-5 space-y-4">
						<!-- Working Hours -->
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
						<fieldset class="space-y-2">
							<legend class="block text-sm font-medium text-foreground">
								Working Days
							</legend>
							<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
								{#each DAY_NAMES as day, index}
									<label
										class="flex items-center space-x-2 cursor-pointer min-h-[44px] py-1"
									>
										<input
											type="checkbox"
											name="working_days"
											value={index}
											checked={calendarPreferences.working_days.includes(
												index
											)}
											class="w-4 h-4 text-accent border-border rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset bg-muted checked:bg-accent cursor-pointer"
										/>
										<span class="text-sm text-foreground">{day}</span>
									</label>
								{/each}
							</div>
						</fieldset>

						<!-- Task Duration Settings -->
						<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
									maxlength={2}
									class="uppercase"
									size="md"
								/>
							</FormField>
						</div>

						<!-- Additional Preferences -->
						<div class="space-y-3">
							<CheckboxField
								bind:checked={calendarPreferences.exclude_holidays}
								name="exclude_holidays"
								label="Exclude holidays from scheduling"
								description="Prevents tasks from being scheduled on national holidays"
								disabled={isSavingCalendar}
							/>

							<CheckboxField
								bind:checked={
									calendarPreferences.prefer_morning_for_important_tasks
								}
								name="prefer_morning_for_important_tasks"
								label="Schedule important tasks in the morning"
								description="Prioritizes morning time slots for high-priority tasks"
								disabled={isSavingCalendar}
							>
								{#snippet labelHtml()}
									<span class="flex items-center">
										<Sun class="w-4 h-4 mr-1 text-accent" />
										Schedule important tasks in the morning
									</span>
								{/snippet}
							</CheckboxField>
						</div>

						<!-- Save Button -->
						<div class="flex justify-end pt-3 border-t border-border">
							<Button
								type="submit"
								disabled={isSavingCalendar}
								loading={isSavingCalendar}
								variant="primary"
								size="sm"
								icon={Save}
								class="shadow-ink pressable"
							>
								{isSavingCalendar ? 'Saving...' : 'Save Preferences'}
							</Button>
						</div>
					</div>
				</form>
			</SettingsCard>

			<!-- Scheduled Tasks Preview -->
			{#if calendarData.scheduledTasks && calendarData.scheduledTasks.length > 0}
				<SettingsCard
					icon={CalendarCheck}
					title="Scheduled Tasks"
					description="Tasks on your calendar"
					labelledById="scheduled-tasks-heading"
					bodyClass="p-0"
				>
					<div class="divide-y divide-border">
						{#each scheduledTasksPreview as task}
							<div class="px-4 sm:px-5 py-3 hover:bg-muted/60 transition-colors">
								<div class="flex items-center justify-between gap-3">
									<div class="flex-1 min-w-0">
										<h4 class="text-sm font-medium text-foreground truncate">
											{task.title}
										</h4>
										{#if task.project}
											<p class="text-xs text-muted-foreground truncate">
												{task.project.name}
											</p>
										{/if}
										{#if task.task_calendar_events?.[0]}
											<p
												class="text-xs text-muted-foreground mt-0.5 flex items-center"
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
											class="inline-flex items-center justify-center p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset pressable flex-shrink-0 min-h-[44px] min-w-[44px]"
										>
											<ChevronRight class="w-4 h-4" />
										</a>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					{#if calendarData.scheduledTasks.length > 10}
						<div
							class="px-4 sm:px-5 py-2 bg-muted/50 text-center border-t border-border"
						>
							<p class="text-xs text-muted-foreground">
								And {calendarData.scheduledTasks.length - 10} more scheduled tasks
							</p>
						</div>
					{/if}
				</SettingsCard>
			{/if}

			<!-- Calendar Intelligence Section -->
			{#if calendarConnected}
				<SettingsCard
					icon={Brain}
					title="Calendar Intelligence"
					description="Discover projects from calendar"
					labelledById="calendar-intelligence-heading"
				>
					<!-- Analysis Button -->
					<div
						class="bg-accent/10 border border-accent/30 rounded-lg p-3 tx tx-grain tx-weak"
					>
						<div
							class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
						>
							<div class="flex-1 min-w-0">
								<h4
									class="text-sm font-semibold text-foreground flex items-center gap-1.5"
								>
									<Sparkles class="w-4 h-4 text-accent" />
									Analyze Your Calendar
								</h4>
								<p class="text-xs text-muted-foreground mt-0.5">
									Find projects in your calendar
								</p>
							</div>
							<Button
								variant="primary"
								size="sm"
								onclick={startCalendarAnalysis}
								disabled={analysisInProgress}
								loading={analysisInProgress}
								icon={Brain}
								class="flex-shrink-0 shadow-ink pressable"
							>
								{analysisInProgress ? 'Analyzing...' : 'Analyze'}
							</Button>
						</div>

						{#if calendarAnalysisHistory.length > 0}
							{@const lastAnalysis = calendarAnalysisHistory[0]}
							<div class="mt-2 text-xs text-muted-foreground">
								Last analyzed {formatRelativeTime(lastAnalysis.completed_at)}
								· {lastAnalysis.projects_created} projects created
							</div>
						{/if}
					</div>

					<!-- Calendar Projects -->
					{#if calendarProjects.length > 0}
						<div class="mt-4">
							<div class="flex items-center justify-between mb-2">
								<h4
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"
								>
									<FolderOpen class="w-3.5 h-3.5" />
									From Calendar ({calendarProjects.length})
								</h4>
							</div>
							<div class="space-y-2">
								{#each calendarProjects.slice(0, 5) as project}
									<a
										href="/projects/{project.id}"
										class="block p-3 bg-card border border-border rounded-lg hover:shadow-ink transition-all motion-reduce:transition-none hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset pressable"
									>
										<div class="flex items-center justify-between gap-3">
											<div class="flex-1 min-w-0">
												<h5
													class="text-sm font-semibold text-foreground truncate"
												>
													{project.name}
												</h5>
												{#if project.description}
													<p
														class="text-xs text-muted-foreground line-clamp-1"
													>
														{project.description}
													</p>
												{/if}
												<p class="text-xs text-muted-foreground/80 mt-0.5">
													Created {formatRelativeTime(project.created_at)}
													{#if project.task_count > 0}
														· {project.task_count} task{project.task_count !==
														1
															? 's'
															: ''}
													{/if}
												</p>
											</div>
											<ExternalLink
												class="w-4 h-4 text-muted-foreground flex-shrink-0"
											/>
										</div>
									</a>
								{/each}

								{#if calendarProjects.length > 5}
									<div class="text-center pt-1">
										<Button
											variant="ghost"
											size="sm"
											onclick={() => goto('/projects?source=calendar')}
											class="pressable"
										>
											View all {calendarProjects.length} calendar projects
										</Button>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</SettingsCard>
			{/if}
		{/if}
	{:else}
		<div class="text-center py-12 tx tx-bloom tx-weak rounded-lg">
			<CircleAlert class="w-10 h-10 text-destructive mx-auto mb-3" />
			<p class="text-sm text-muted-foreground mb-4">
				Failed to load calendar settings. Please try again.
			</p>
			<Button
				onclick={loadCalendarData}
				variant="primary"
				size="sm"
				icon={RefreshCw}
				class="shadow-ink pressable"
			>
				Retry
			</Button>
		</div>
	{/if}
</div>

<!-- Calendar Analysis Modals -->
<CalendarAnalysisModal
	bind:isOpen={showAnalysisModal}
	onFirstConnection={true}
	onAnalyze={() => {
		showAnalysisModal = false;
		startCalendarAnalysis();
	}}
/>

<!-- Calendar Disconnect Modal -->
<CalendarDisconnectModal
	bind:isOpen={showDisconnectModal}
	calendarData={calendarDependencies?.breakdown}
	loading={disconnecting}
	onconfirm={handleDisconnectConfirm}
	oncancel={() => (showDisconnectModal = false)}
/>
