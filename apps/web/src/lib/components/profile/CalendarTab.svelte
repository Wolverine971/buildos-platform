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

	// Handle calendar data from form actions
	$effect(() => {
		if (form?.calendarData) {
			calendarData = form.calendarData;
			calendarPreferences = form.calendarData.calendarPreferences;
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

	// Handle URL parameters for success/error messages
	$effect(() => {
		if (browser && $page.url.searchParams.get('success') === 'calendar_connected') {
			// Calendar was just connected, refresh data and show success
			refreshCalendarData();
			onsuccess?.({ message: 'Google Calendar connected successfully!' });

			// Check if this is first-time calendar connection
			const hasShownAnalysis =
				localStorage.getItem('calendar_analysis_requested') ||
				localStorage.getItem('calendar_analysis_skipped');

			if (!hasShownAnalysis) {
				// Show the analysis modal for first-time users
				showAnalysisModal = true;
			}

			// Clean up URL parameters
			const newUrl = new URL($page.url);
			newUrl.searchParams.delete('success');
			replaceState(newUrl.toString(), {});
		}
	});

	// Handle analyze parameter from URL
	$effect(() => {
		if (browser && $page.url.searchParams.get('analyze') === 'true') {
			startCalendarAnalysis();
			// Clean up URL parameter
			const newUrl = new URL($page.url);
			newUrl.searchParams.delete('analyze');
			replaceState(newUrl.toString(), {});
		}
	});

	$effect(() => {
		if (browser && $page.url.searchParams.get('error')) {
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

			onerror?.({ message: errorMessage });

			// Clean up URL parameters
			const newUrl = new URL($page.url);
			newUrl.searchParams.delete('error');
			replaceState(newUrl.toString(), {});
		}
	});

	// Computed values
	let calendarConnected = $derived(calendarData?.calendarStatus?.isConnected ?? false);

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
			const response = await fetch('/profile/calendar');

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
			calendarPreferences = result.calendarPreferences;

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
				onerror?.({ message: 'Failed to refresh calendar settings' });
				return;
			}

			calendarData = result;
			calendarPreferences = result.calendarPreferences;
		} catch (error) {
			console.error('Error refreshing calendar settings:', error);
			onerror?.({ message: 'Error refreshing calendar settings' });
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

	async function loadCalendarProjects() {
		try {
			if (!supabase) return; // Guard for SSR
			const { data: actorId, error: actorError } = await supabase.rpc(
				'ensure_actor_for_user',
				{
					p_user_id: data.user.id
				}
			);

			if (actorError || !actorId) throw actorError || new Error('Failed to resolve actor');

			const { data: projects, error: projectsError } = await supabase
				.from('onto_projects')
				.select('id, name, created_at, description, props')
				.eq('created_by', actorId)
				.is('deleted_at', null)
				.order('created_at', { ascending: false });

			if (projectsError) throw projectsError;

			const calendarSourceProjects = (projects || []).filter((project) => {
				const props = (project.props as Record<string, unknown> | null) ?? {};
				const source = props.source;
				const sourceMetadata =
					(props.source_metadata as Record<string, unknown> | null)?.source ?? null;
				return source === 'calendar_analysis' || sourceMetadata === 'calendar_analysis';
			});

			const projectIds = calendarSourceProjects.map((project) => project.id);
			let taskCountByProject = new Map<string, number>();
			if (projectIds.length > 0) {
				const { data: tasks, error: tasksError } = await supabase
					.from('onto_tasks')
					.select('id, project_id')
					.in('project_id', projectIds)
					.is('deleted_at', null);

				if (tasksError) throw tasksError;

				taskCountByProject = new Map<string, number>();
				for (const task of tasks || []) {
					taskCountByProject.set(
						task.project_id,
						(taskCountByProject.get(task.project_id) || 0) + 1
					);
				}
			}

			calendarProjects = calendarSourceProjects.map((project) => ({
				id: project.id,
				name: project.name,
				created_at: project.created_at,
				description: project.description,
				task_count: taskCountByProject.get(project.id) || 0
			}));
		} catch (error) {
			console.error('Error loading calendar projects:', error);
		}
	}

	function formatRelativeTime(dateString: string | null) {
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
		if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
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

<div class="space-y-6">
	{#if loadingCalendar}
		<div class="text-center py-12">
			<LoaderCircle class="w-8 h-8 animate-spin text-accent mx-auto mb-4" />
			<p class="text-muted-foreground">Loading calendar settings...</p>
		</div>
	{:else if calendarData}
		<!-- Google Calendar Integration -->
		<div
			class="bg-card rounded-lg shadow-ink border border-border overflow-hidden tx tx-frame tx-weak"
		>
			<div class="p-4 sm:p-6 border-b border-border">
				<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
					<div class="flex items-center space-x-3">
						<div class="p-2 bg-accent/20 rounded-lg flex-shrink-0">
							<Calendar class="w-5 h-5 sm:w-6 sm:h-6 text-accent" />
						</div>
						<div class="min-w-0">
							<h2 class="text-base sm:text-xl font-semibold text-foreground truncate">
								{#if calendarConnected}
									{calendarData.calendarStatus?.google_email ||
										'Calendar Connected'}
								{:else}
									Google Calendar
								{/if}
							</h2>
							{#if !calendarConnected}
								<p class="text-xs sm:text-sm text-muted-foreground mt-1">
									Connect to schedule tasks automatically
								</p>
							{/if}
						</div>
					</div>

					{#if calendarConnected}
						<div class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
							<div class="text-left sm:text-right">
								<div class="flex items-center space-x-2">
									<CircleCheck class="w-4 h-4 text-emerald-500" />
									<p class="text-sm font-medium text-emerald-600">Connected</p>
								</div>
								{#if calendarData.calendarStatus?.lastSync}
									<p class="text-xs text-muted-foreground">
										Last sync: {formatLastSync(
											calendarData.calendarStatus.lastSync
										)}
									</p>
								{/if}
							</div>

							<div class="flex items-center gap-2">
								<Button
									onclick={refreshCalendarData}
									disabled={refreshingCalendar}
									variant="ghost"
									size="sm"
									title="Refresh calendar data"
									icon={RefreshCw}
									loading={refreshingCalendar}
								></Button>

								<Button
									onclick={handleDisconnectClick}
									variant="danger"
									size="sm"
									class="sm:size-md"
									icon={Unlink}
									disabled={checkingDependencies || disconnecting}
									loading={checkingDependencies || disconnecting}
								>
									<span class="hidden sm:inline">Disconnect</span>
									<span class="sm:hidden">Disconnect</span>
								</Button>
							</div>
						</div>
					{:else}
						<Button
							onclick={connectCalendar}
							variant="primary"
							size="md"
							icon={Link}
							class="w-full sm:w-auto shadow-ink pressable"
						>
							<span class="hidden sm:inline">Connect Calendar</span>
							<span class="sm:hidden">Connect</span>
						</Button>
					{/if}
				</div>
			</div>

			<!-- Features List -->
			<div class="p-4 sm:p-6 bg-muted">
				<h3 class="text-sm font-medium text-foreground mb-3">Calendar Features:</h3>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<div class="flex items-start space-x-2">
						<CircleCheck class="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
						<div>
							<p class="text-sm font-medium text-foreground">
								Automatic Task Scheduling
							</p>
							<p class="text-xs text-muted-foreground">
								Schedule tasks in project phases directly to your calendar
							</p>
						</div>
					</div>
					<div class="flex items-start space-x-2">
						<CircleCheck class="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
						<div>
							<p class="text-sm font-medium text-foreground">Smart Time Slots</p>
							<p class="text-xs text-muted-foreground">
								Find available time slots based on your preferences
							</p>
						</div>
					</div>
					<div class="flex items-start space-x-2">
						<CircleCheck class="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
						<div>
							<p class="text-sm font-medium text-foreground">Two-way Sync</p>
							<p class="text-xs text-muted-foreground">
								Keep tasks and calendar events in sync automatically
							</p>
						</div>
					</div>
					<div class="flex items-start space-x-2">
						<CircleCheck class="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
						<div>
							<p class="text-sm font-medium text-foreground">Holiday Awareness</p>
							<p class="text-xs text-muted-foreground">
								Automatically avoid scheduling on holidays
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Calendar Preferences -->
		{#if calendarConnected && calendarPreferences}
			<div class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak">
				<div class="p-4 sm:p-6 border-b border-border">
					<h2
						class="text-base sm:text-xl font-semibold text-foreground flex items-center"
					>
						<Clock class="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-accent" />
						Calendar Preferences
					</h2>
					<p class="text-xs sm:text-sm text-muted-foreground mt-1">
						Customize how tasks are scheduled
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
					<div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
						<!-- Working Hours -->
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
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
									<label class="flex items-center space-x-2 cursor-pointer">
										<input
											type="checkbox"
											name="working_days"
											value={index}
											checked={calendarPreferences.working_days.includes(
												index
											)}
											class="w-4 h-4 text-accent border-border rounded focus:ring-accent
                                            bg-muted checked:bg-accent cursor-pointer"
										/>
										<span class="text-sm text-foreground">{day}</span>
									</label>
								{/each}
							</div>
						</fieldset>

						<!-- Task Duration Settings -->
						<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
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
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
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
									class="w-4 h-4 text-accent border-border rounded focus:ring-accent
                                    bg-muted checked:bg-accent cursor-pointer"
								/>
								<div>
									<span class="text-sm font-medium text-foreground">
										Exclude holidays from scheduling
									</span>
									<p class="text-xs text-muted-foreground">
										Prevents tasks from being scheduled on national holidays
									</p>
								</div>
							</label>

							<label class="flex items-center space-x-3 cursor-pointer">
								<input
									type="checkbox"
									name="prefer_morning_for_important_tasks"
									checked={calendarPreferences.prefer_morning_for_important_tasks}
									class="w-4 h-4 text-accent border-border rounded focus:ring-accent
                                    bg-muted checked:bg-accent cursor-pointer"
								/>
								<div>
									<span
										class="text-sm font-medium text-foreground flex items-center"
									>
										<Sun class="w-4 h-4 mr-1 text-amber-500" />
										Schedule important tasks in the morning
									</span>
									<p class="text-xs text-muted-foreground">
										Prioritizes morning time slots for high-priority tasks
									</p>
								</div>
							</label>
						</div>

						<!-- Save Button -->
						<div class="flex justify-end pt-4 border-t border-border">
							<Button
								type="submit"
								disabled={isSavingCalendar}
								loading={isSavingCalendar}
								variant="primary"
								size="md"
								icon={Save}
								class="w-full sm:w-auto shadow-ink pressable"
							>
								{isSavingCalendar ? 'Saving...' : 'Save Preferences'}
							</Button>
						</div>
					</div>
				</form>
			</div>

			<!-- Scheduled Tasks Preview -->
			{#if calendarData.scheduledTasks && calendarData.scheduledTasks.length > 0}
				<div class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak">
					<div class="p-4 sm:p-6 border-b border-border">
						<h2
							class="text-base sm:text-xl font-semibold text-foreground flex items-center"
						>
							<CalendarCheck class="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-emerald-500" />
							Scheduled Tasks
						</h2>
						<p class="text-xs sm:text-sm text-muted-foreground mt-1">
							Tasks on your calendar
						</p>
					</div>

					<div class="divide-y divide-border">
						{#each calendarData.scheduledTasks.slice(0, 10) as task}
							<div class="p-4 hover:bg-muted transition-colors">
								<div class="flex items-center justify-between">
									<div class="flex-1">
										<h4 class="font-medium text-foreground">
											{task.title}
										</h4>
										{#if task.project}
											<p class="text-sm text-muted-foreground">
												{task.project.name}
											</p>
										{/if}
										{#if task.task_calendar_events?.[0]}
											<p
												class="text-xs text-muted-foreground mt-1 flex items-center"
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
											class="ml-4 p-2 text-muted-foreground hover:text-foreground
                                            rounded-lg hover:bg-muted transition-colors pressable"
										>
											<ChevronRight class="w-5 h-5" />
										</a>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					{#if calendarData.scheduledTasks.length > 10}
						<div class="p-4 bg-muted text-center">
							<p class="text-sm text-muted-foreground">
								And {calendarData.scheduledTasks.length - 10} more scheduled tasks...
							</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Calendar Intelligence Section -->
			{#if calendarConnected}
				<div class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak">
					<div class="p-4 sm:p-6 border-b border-border">
						<h2
							class="text-base sm:text-xl font-semibold text-foreground flex items-center"
						>
							<Brain class="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-purple-500" />
							Calendar Intelligence
						</h2>
						<p class="text-xs sm:text-sm text-muted-foreground mt-1">
							Discover projects from calendar
						</p>
					</div>

					<div class="p-4 sm:p-6">
						<!-- Analysis Button -->
						<div
							class="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 sm:p-4 tx tx-grain tx-weak"
						>
							<div
								class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
							>
								<div class="flex-1">
									<h4
										class="font-medium text-foreground flex items-center text-sm sm:text-base"
									>
										<Sparkles class="w-4 h-4 mr-2 text-purple-500" />
										Analyze Your Calendar
									</h4>
									<p class="text-xs sm:text-sm text-muted-foreground mt-1">
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
									class="w-full sm:w-auto flex-shrink-0 shadow-ink pressable"
								>
									{analysisInProgress ? 'Analyzing...' : 'Analyze'}
								</Button>
							</div>

							<!-- Last Analysis Info -->
							{#if calendarAnalysisHistory.length > 0}
								{@const lastAnalysis = calendarAnalysisHistory[0]}
								<div class="mt-3 text-sm text-muted-foreground">
									Last analyzed: {formatRelativeTime(lastAnalysis.completed_at)}
									• {lastAnalysis.projects_created} projects created
								</div>
							{/if}
						</div>

						<!-- Calendar Projects -->
						{#if calendarProjects.length > 0}
							<div class="mt-6">
								<h4 class="font-medium text-foreground mb-3 flex items-center">
									<FolderOpen class="w-4 h-4 mr-2 text-muted-foreground" />
									Projects from Calendar ({calendarProjects.length})
								</h4>
								<div class="space-y-2">
									{#each calendarProjects.slice(0, 5) as project}
										<a
											href="/projects/{project.id}"
											class="block p-3 bg-card border border-border rounded-lg hover:shadow-ink transition-all hover:border-purple-500/50 pressable"
										>
											<div class="flex items-center justify-between">
												<div class="flex-1">
													<h5 class="font-medium text-foreground">
														{project.name}
													</h5>
													{#if project.description}
														<p
															class="text-sm text-muted-foreground line-clamp-1"
														>
															{project.description}
														</p>
													{/if}
													<p class="text-xs text-muted-foreground mt-1">
														Created {formatRelativeTime(
															project.created_at
														)}
														{#if project.task_count > 0}
															• {project.task_count} task{project.task_count !==
															1
																? 's'
																: ''}
														{/if}
													</p>
												</div>
												<div class="flex items-center space-x-2">
													<span
														class="inline-flex items-center px-2 py-1 text-xs font-medium bg-muted text-muted-foreground rounded-md border border-border"
													>
														<Calendar class="w-3 h-3 mr-1" />
														From Calendar
													</span>
													<ExternalLink
														class="w-4 h-4 text-muted-foreground"
													/>
												</div>
											</div>
										</a>
									{/each}

									{#if calendarProjects.length > 5}
										<div class="text-center pt-2">
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
					</div>
				</div>
			{/if}
		{/if}
	{:else}
		<div class="text-center py-12 tx tx-bloom tx-weak rounded-lg">
			<CircleAlert class="w-12 h-12 text-red-500 mx-auto mb-4" />
			<p class="text-muted-foreground mb-4">
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
