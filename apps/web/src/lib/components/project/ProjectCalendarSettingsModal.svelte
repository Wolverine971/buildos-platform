<!-- apps/web/src/lib/components/project/ProjectCalendarSettingsModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { addDays, startOfDay } from 'date-fns';
	import Modal from '$lib/components/ui/Modal.svelte';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import type { Tab } from '$lib/components/ui/TabNav.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CalendarView from '$lib/components/scheduling/CalendarView.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { fetchCalendarItems } from '$lib/services/calendar-items.service';
	import type { CalendarItem } from '$lib/types/calendar-items';
	import { getWeekDates, getMonthDates } from '$lib/utils/schedulingUtils';
	import {
		Calendar,
		Check,
		AlertCircle,
		LoaderCircle,
		Trash2,
		Palette,
		Settings,
		Users
	} from 'lucide-svelte';
	import type { Database } from '@buildos/shared-types';
	import type { Component } from 'svelte';
	import {
		GOOGLE_CALENDAR_COLORS,
		type GoogleColorId,
		DEFAULT_CALENDAR_COLOR
	} from '$lib/config/calendar-colors';
	import type { Project } from '$lib/types/onto';

	type ProjectCalendar = Database['public']['Tables']['project_calendars']['Row'];
	type CalendarViewMode = 'day' | 'week' | 'month';
	type CalendarModalTab = 'calendar' | 'settings';
	type LazyComponent = Component<any, any, any> | null;
	type ProjectCalendarSyncMode = 'actor_projection' | 'member_fanout';

	interface CollaborationMember {
		actor_id: string;
		user_id: string | null;
		display_name: string;
		email: string | null;
		role_key: string;
		access: string;
		has_calendar: boolean;
		sync_enabled: boolean;
		calendar_name: string | null;
		sync_status: string | null;
		is_current_user: boolean;
	}

	interface CollaborationSummary {
		sync_mode: ProjectCalendarSyncMode;
		total_members: number;
		mapped_members: number;
		active_sync_members: number;
		pending_invite_count: number;
		pending_invites: Array<{
			invitee_email: string;
			role_key: string;
			access: string;
			expires_at: string;
		}>;
		members: CollaborationMember[];
	}

	interface Props {
		isOpen: boolean;
		project: Project | null;
		onClose?: () => void;
		onCalendarCreated?: (calendar: ProjectCalendar) => void;
		onCalendarUpdated?: (calendar: ProjectCalendar) => void;
		onCalendarDeleted?: () => void;
	}

	let {
		isOpen = $bindable(false),
		project,
		onClose,
		onCalendarCreated,
		onCalendarUpdated,
		onCalendarDeleted
	}: Props = $props();

	const BUFFER_DAYS = 7;

	let loading = $state(false);
	let saving = $state(false);
	let deleting = $state(false);
	let errors = $state<string[]>([]);

	let calendarExists = $state(false);
	let collaborationLoading = $state(false);
	let collaborationError = $state<string | null>(null);
	let collaborationSummary = $state<CollaborationSummary | null>(null);

	let activeTab = $state<CalendarModalTab>('calendar');

	const tabs: Tab[] = [
		{ id: 'calendar', label: 'Calendar', icon: Calendar },
		{ id: 'settings', label: 'Settings', icon: Settings }
	];

	let viewMode = $state<CalendarViewMode>('month');
	let currentDate = $state(new Date());
	let calendarItems = $state<CalendarItem[]>([]);
	let calendarLoading = $state(false);
	let calendarRefreshing = $state(false);
	let calendarError = $state<string | null>(null);
	let editingTaskId = $state<string | null>(null);
	let editingEventId = $state<string | null>(null);
	let TaskEditModalComponent = $state<LazyComponent>(null);
	let EventEditModalComponent = $state<LazyComponent>(null);

	let formData = $state({
		calendarName: '',
		calendarDescription: '',
		selectedColorId: DEFAULT_CALENDAR_COLOR as GoogleColorId,
		syncEnabled: true,
		syncMode: 'actor_projection' as ProjectCalendarSyncMode
	});

	let defaultColorId = $derived.by(() => {
		const projectProps = (project?.props as Record<string, unknown> | null) ?? {};
		const calendarProps = (projectProps.calendar as Record<string, unknown> | null) ?? {};
		return (calendarProps.color_id || DEFAULT_CALENDAR_COLOR) as GoogleColorId;
	});

	let calendarWorkingHours = $derived({
		work_start_time: '00:00',
		work_end_time: '24:00',
		working_days: [0, 1, 2, 3, 4, 5, 6]
	});

	function getItemColorClass(item: CalendarItem): string {
		if (item.item_type === 'task') {
			if (item.item_kind === 'range') {
				return 'bg-emerald-500/10 border border-emerald-500/30';
			}
			if (item.item_kind === 'start') {
				return 'bg-sky-500/10 border border-sky-500/30';
			}
			return 'bg-amber-500/10 border border-amber-500/30';
		}
		return 'bg-muted border border-border';
	}

	let calendarEvents = $derived(
		calendarItems.map((item) => ({
			summary: item.title || '(Untitled)',
			start: { dateTime: item.start_at },
			end: { dateTime: item.end_at || item.start_at },
			htmlLink: (item.props?.external_link as string | undefined) ?? undefined,
			externalLink: (item.props?.external_link as string | undefined) ?? undefined,
			colorClass: getItemColorClass(item),
			calendarItem: item
		}))
	);

	function getViewRange(date: Date, mode: CalendarViewMode): { start: Date; end: Date } {
		if (mode === 'day') {
			const start = startOfDay(date);
			return { start, end: addDays(start, 1) };
		}
		if (mode === 'month') {
			const monthDates = getMonthDates(date);
			const monthStart = monthDates[0] ?? date;
			const monthEnd = monthDates[monthDates.length - 1] ?? monthStart;
			const start = startOfDay(monthStart);
			const end = startOfDay(addDays(monthEnd, 1));
			return { start, end };
		}
		const weekDates = getWeekDates(date);
		const weekStart = weekDates[0] ?? date;
		const weekEnd = weekDates[weekDates.length - 1] ?? weekStart;
		const start = startOfDay(weekStart);
		const end = startOfDay(addDays(weekEnd, 1));
		return { start, end };
	}

	$effect(() => {
		if (!isOpen) {
			activeTab = 'calendar';
			viewMode = 'month';
			currentDate = new Date();
			calendarItems = [];
			calendarError = null;
			collaborationSummary = null;
			collaborationError = null;
			return;
		}

		if (browser && project) {
			void loadCalendarSettings();
			void loadCollaborationSummary();
		}
	});

	$effect(() => {
		if (!browser || !isOpen || !project?.id || activeTab !== 'calendar') return;
		const selectedDate = currentDate;
		const selectedView = viewMode;
		void loadProjectCalendar(selectedDate, selectedView);
	});

	function handleTabChange(event: { detail: string }) {
		activeTab = event.detail as CalendarModalTab;
	}

	function handleCalendarDateChange(date: Date) {
		currentDate = date;
	}

	function handleCalendarViewModeChange(mode: CalendarViewMode) {
		viewMode = mode;
	}

	function handleCalendarRefresh() {
		void loadProjectCalendar(currentDate, viewMode, { refreshing: true });
	}

	function resolveCalendarItem(event: any): CalendarItem | null {
		return (
			event?.calendarItem ||
			event?.originalEvent?.calendarItem ||
			event?.originalEvent ||
			null
		);
	}

	async function loadTaskEditModal() {
		if (!TaskEditModalComponent) {
			const mod = await import('$lib/components/ontology/TaskEditModal.svelte');
			TaskEditModalComponent = mod.default;
		}
		return TaskEditModalComponent;
	}

	async function loadEventEditModal() {
		if (!EventEditModalComponent) {
			const mod = await import('$lib/components/ontology/EventEditModal.svelte');
			EventEditModalComponent = mod.default;
		}
		return EventEditModalComponent;
	}

	async function handleCalendarEventClick(event: any) {
		const item = resolveCalendarItem(event);
		if (!item) {
			toastService.warning('Could not open calendar item details');
			return;
		}

		if (item.item_type === 'task' && item.task_id) {
			await loadTaskEditModal();
			editingTaskId = item.task_id;
			editingEventId = null;
			return;
		}

		if (item.event_id) {
			await loadEventEditModal();
			editingEventId = item.event_id;
			editingTaskId = null;
			return;
		}

		toastService.warning('This calendar item cannot be edited');
	}

	function closeTaskEditor() {
		editingTaskId = null;
	}

	function closeEventEditor() {
		editingEventId = null;
	}

	function handleEditorUpdated() {
		void loadProjectCalendar(currentDate, viewMode, { refreshing: true });
	}

	async function loadProjectCalendar(
		selectedDate: Date,
		selectedView: CalendarViewMode,
		options: { refreshing?: boolean } = {}
	) {
		const projectId = project?.id;
		if (!projectId) return;

		if (options.refreshing) {
			calendarRefreshing = true;
		} else {
			calendarLoading = true;
		}
		calendarError = null;

		try {
			const range = getViewRange(selectedDate, selectedView);
			const bufferedStart = addDays(range.start, -BUFFER_DAYS);
			const bufferedEnd = addDays(range.end, BUFFER_DAYS);

			calendarItems = await fetchCalendarItems({
				start: bufferedStart.toISOString(),
				end: bufferedEnd.toISOString(),
				includeEvents: true,
				includeTaskRange: true,
				includeTaskStart: false,
				includeTaskDue: false,
				projectIds: [projectId]
			});
		} catch (error) {
			console.error('[ProjectCalendarModal] Failed to load project calendar items:', error);
			calendarError =
				error instanceof Error ? error.message : 'Failed to load project calendar items';
			calendarItems = [];
		} finally {
			calendarLoading = false;
			calendarRefreshing = false;
		}
	}

	async function loadCalendarSettings() {
		if (!project?.id) return;

		loading = true;
		errors = [];

		try {
			const response = await fetch(`/api/onto/projects/${project.id}/calendar`);
			const result = await response.json();

			if (result.success && result.data) {
				const calendar = result.data;
				calendarExists = true;
				formData = {
					calendarName: calendar.calendar_name,
					calendarDescription: '',
					selectedColorId: (calendar.color_id || DEFAULT_CALENDAR_COLOR) as GoogleColorId,
					syncEnabled: calendar.sync_enabled ?? true,
					syncMode: (calendar.sync_mode || 'actor_projection') as ProjectCalendarSyncMode
				};
			} else {
				calendarExists = false;
				formData = {
					calendarName: `${project.name} - Tasks`,
					calendarDescription:
						project.description || `Tasks and events for ${project.name}`,
					selectedColorId: defaultColorId,
					syncEnabled: true,
					syncMode: collaborationSummary?.sync_mode ?? 'actor_projection'
				};
			}
		} catch (error) {
			console.error('Error loading calendar settings:', error);
			errors = ['Failed to load calendar settings'];
			calendarExists = false;
			formData = {
				calendarName: `${project.name} - Tasks`,
				calendarDescription: project.description || `Tasks and events for ${project.name}`,
				selectedColorId: defaultColorId,
				syncEnabled: true,
				syncMode: collaborationSummary?.sync_mode ?? 'actor_projection'
			};
		} finally {
			loading = false;
		}
	}

	async function loadCollaborationSummary() {
		if (!project?.id) return;

		collaborationLoading = true;
		collaborationError = null;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}/calendar/collaboration`);
			const result = await response.json();

			if (result.success && result.data) {
				collaborationSummary = result.data as CollaborationSummary;
				formData.syncMode = collaborationSummary.sync_mode;
			} else {
				collaborationSummary = null;
				collaborationError = result.error || 'Failed to load collaboration sync status';
			}
		} catch (error) {
			console.error('Error loading collaboration sync status:', error);
			collaborationSummary = null;
			collaborationError = 'Failed to load collaboration sync status';
		} finally {
			collaborationLoading = false;
		}
	}

	async function persistProjectSyncMode(projectId: string, syncMode: ProjectCalendarSyncMode) {
		const response = await fetch(`/api/onto/projects/${projectId}/calendar`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ syncMode })
		});

		const result = await response.json();
		if (!result.success) {
			throw new Error(result.error || 'Failed to update sync mode');
		}
	}

	function getMemberSyncBadge(member: CollaborationMember): {
		label: string;
		className: string;
	} {
		if (!member.has_calendar) {
			return {
				label: 'Not linked',
				className: 'bg-muted text-muted-foreground border border-border'
			};
		}

		if (!member.sync_enabled) {
			return {
				label: 'Sync off',
				className:
					'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'
			};
		}

		return {
			label: 'Synced',
			className:
				'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
		};
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!project?.id) return;

		saving = true;
		errors = [];

		try {
			if (!calendarExists) {
				const response = await fetch(`/api/onto/projects/${project.id}/calendar`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: formData.calendarName,
						description: formData.calendarDescription,
						colorId: formData.selectedColorId
					})
				});

				const result = await response.json();
				if (result.success) {
					calendarExists = true;
					if (formData.syncMode !== 'actor_projection') {
						try {
							await persistProjectSyncMode(project.id, formData.syncMode);
						} catch (syncModeError) {
							console.error(
								'Failed to update project sync mode after calendar create:',
								syncModeError
							);
							toastService.warning(
								'Calendar was created, but we could not update the project sync mode'
							);
						}
					}
					toastService.success('Project calendar created successfully');
					onCalendarCreated?.(result.data);
				} else {
					throw new Error(result.error || 'Failed to create calendar');
				}
			} else {
				const response = await fetch(`/api/onto/projects/${project.id}/calendar`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: formData.calendarName,
						colorId: formData.selectedColorId,
						syncEnabled: formData.syncEnabled,
						syncMode: formData.syncMode
					})
				});

				const result = await response.json();
				if (result.success) {
					toastService.success('Calendar settings updated');
					onCalendarUpdated?.(result.data);
				} else {
					throw new Error(result.error || 'Failed to update calendar');
				}
			}

			void loadCollaborationSummary();
		} catch (error: unknown) {
			console.error('Error saving calendar:', error);
			const message =
				error instanceof Error ? error.message : 'Failed to save calendar settings';
			errors = [message];
		} finally {
			saving = false;
		}
	}

	async function deleteCalendar() {
		if (!project?.id) return;

		if (
			!confirm(
				'Are you sure you want to delete this project calendar? This cannot be undone.'
			)
		) {
			return;
		}

		deleting = true;
		try {
			const response = await fetch(`/api/onto/projects/${project.id}/calendar`, {
				method: 'DELETE'
			});

			const result = await response.json();
			if (result.success) {
				calendarExists = false;
				toastService.success('Calendar deleted successfully');
				onCalendarDeleted?.();
				handleClose();
			} else {
				toastService.error(result.error || 'Failed to delete calendar');
			}
		} catch (error) {
			console.error('Error deleting calendar:', error);
			toastService.error('Failed to delete calendar');
		} finally {
			deleting = false;
		}
	}

	function handleClose() {
		isOpen = false;
		onClose?.();
	}

	function selectColor(colorId: string) {
		formData.selectedColorId = colorId as GoogleColorId;
	}
</script>

<Modal bind:isOpen onClose={handleClose} size="xl">
	{#snippet header()}
		<div
			class="flex-shrink-0 bg-muted border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-accent/10 text-accent shrink-0"
				>
					<Calendar class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						Calendar
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						View and manage calendar details for {project?.name || 'this project'}
					</p>
				</div>
			</div>
			<button
				type="button"
				onclick={handleClose}
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring tx tx-grain tx-weak"
				aria-label="Close modal"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</button>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="flex h-[72vh] max-h-[72vh] flex-col bg-background tx tx-frame tx-weak">
			<div class="px-3 sm:px-4 pt-2 border-b border-border">
				<TabNav
					{tabs}
					{activeTab}
					onchange={handleTabChange}
					ariaLabel="Project calendar tabs"
				/>
			</div>

			{#if activeTab === 'calendar'}
				<div class="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2">
					{#if calendarError}
						<div
							class="p-2.5 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak"
						>
							<div class="flex items-start gap-2">
								<AlertCircle
									class="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0"
								/>
								<div class="flex-1">
									<h3 class="text-xs font-semibold text-destructive">
										Error loading calendar
									</h3>
									<p class="mt-0.5 text-xs text-destructive/80">
										{calendarError}
									</p>
								</div>
							</div>
						</div>
					{/if}

					<div
						class="flex-1 min-h-[32rem] rounded-lg border border-border bg-card overflow-hidden shadow-ink"
					>
						<CalendarView
							{viewMode}
							{currentDate}
							events={calendarEvents}
							workingHours={calendarWorkingHours}
							loading={calendarLoading}
							refreshing={calendarRefreshing}
							ondateChange={handleCalendarDateChange}
							onviewModeChange={handleCalendarViewModeChange}
							onrefresh={handleCalendarRefresh}
							oneventClick={handleCalendarEventClick}
						/>
					</div>
				</div>
			{:else}
				<div class="flex-1 overflow-y-auto bg-background tx tx-frame tx-weak">
					{#if loading}
						<div class="flex items-center justify-center py-12">
							<LoaderCircle class="h-6 w-6 animate-spin text-accent" />
						</div>
					{:else}
						<div class="p-4 space-y-3 sm:p-5 sm:space-y-4">
							{#if errors.length > 0}
								<div
									class="p-3 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak"
								>
									<div class="flex items-start gap-2">
										<AlertCircle
											class="h-4 w-4 text-destructive mt-0.5 flex-shrink-0"
										/>
										<div class="flex-1">
											<h3 class="text-xs font-semibold text-destructive">
												Error with calendar settings
											</h3>
											<div class="mt-1 text-xs text-destructive/80">
												<ul class="list-disc space-y-0.5 pl-4">
													{#each errors as error}
														<li>{error}</li>
													{/each}
												</ul>
											</div>
										</div>
									</div>
								</div>
							{/if}

							<form onsubmit={handleSubmit} class="space-y-3 sm:space-y-4">
								<div
									class="bg-card rounded-lg border border-border p-3 sm:p-4 shadow-ink"
								>
									<div class="flex items-center justify-between gap-2">
										<div class="flex items-center gap-2 sm:gap-3">
											<div class="p-1.5 sm:p-2 bg-accent/10 rounded-lg">
												<Settings
													class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent"
												/>
											</div>
											<div>
												<p class="text-sm font-semibold text-foreground">
													Calendar Status
												</p>
												<p class="text-xs text-muted-foreground">
													{calendarExists
														? 'Connected to Google Calendar'
														: 'No calendar created yet'}
												</p>
											</div>
										</div>
										{#if calendarExists}
											<div
												class="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400"
											>
												<Check class="h-3 w-3" />
												<span class="hidden sm:inline">Connected</span>
											</div>
										{:else}
											<div
												class="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-lg text-xs font-medium text-muted-foreground"
											>
												<AlertCircle class="h-3 w-3" />
												<span class="hidden sm:inline">Not connected</span>
											</div>
										{/if}
									</div>
								</div>

								<div
									class="bg-card rounded-lg border border-border p-3 sm:p-4 shadow-ink"
								>
									<div class="flex items-center justify-between gap-2 mb-2">
										<div class="flex items-center gap-2 sm:gap-3">
											<div class="p-1.5 sm:p-2 bg-accent/10 rounded-lg">
												<Users
													class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent"
												/>
											</div>
											<div>
												<p class="text-sm font-semibold text-foreground">
													Team Sync Coverage
												</p>
												{#if collaborationSummary}
													<p class="text-xs text-muted-foreground">
														{collaborationSummary.active_sync_members} of
														{collaborationSummary.total_members} members
														actively syncing
														{#if collaborationSummary.pending_invite_count > 0}
															• {collaborationSummary.pending_invite_count}
															pending invite{collaborationSummary.pending_invite_count ===
															1
																? ''
																: 's'}
														{/if}
													</p>
												{:else}
													<p class="text-xs text-muted-foreground">
														Shows who has linked a project calendar
													</p>
												{/if}
											</div>
										</div>
										{#if collaborationLoading}
											<LoaderCircle
												class="h-4 w-4 animate-spin text-muted-foreground"
											/>
										{/if}
									</div>

									{#if collaborationError}
										<p class="text-xs text-destructive">{collaborationError}</p>
									{:else if collaborationSummary}
										<div class="space-y-2">
											<div
												class="flex items-center justify-between rounded-md border border-border/70 bg-background/70 px-2.5 py-2 text-xs"
											>
												<span class="text-muted-foreground"
													>Project sync mode</span
												>
												<span class="font-medium text-foreground">
													{collaborationSummary.sync_mode ===
													'member_fanout'
														? 'Member fanout'
														: 'Actor projection'}
												</span>
											</div>
											<div class="max-h-44 overflow-y-auto space-y-1.5 pr-1">
												{#each collaborationSummary.members as member}
													{@const badge = getMemberSyncBadge(member)}
													<div
														class="flex items-start justify-between gap-2 rounded-md border border-border/80 bg-background/70 px-2.5 py-2"
													>
														<div class="min-w-0">
															<p
																class="text-xs font-medium text-foreground truncate"
															>
																{member.display_name}
																{#if member.is_current_user}
																	<span
																		class="text-muted-foreground font-normal"
																	>
																		(You)
																	</span>
																{/if}
															</p>
															<p
																class="text-[11px] text-muted-foreground truncate"
															>
																{member.calendar_name ||
																	'No calendar linked'}
															</p>
														</div>
														<span
															class={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
														>
															{badge.label}
														</span>
													</div>
												{/each}
												{#each collaborationSummary.pending_invites as invite}
													<div
														class="flex items-start justify-between gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-2.5 py-2"
													>
														<div class="min-w-0">
															<p
																class="text-xs font-medium text-foreground truncate"
															>
																{invite.invitee_email}
															</p>
															<p
																class="text-[11px] text-muted-foreground truncate"
															>
																Invite pending, not linked yet
															</p>
														</div>
														<div class="flex flex-col items-end gap-1">
															<span
																class="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30"
															>
																Pending invite
															</span>
															<span
																class="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border"
															>
																Not linked
															</span>
														</div>
													</div>
												{/each}
											</div>
										</div>
									{/if}
								</div>

								<div
									class="bg-card rounded-lg border border-border p-3 sm:p-4 shadow-ink"
								>
									<FormField label="Calendar Name" required>
										<TextInput
											bind:value={formData.calendarName}
											placeholder="{project?.name} - Tasks"
											required
											class="w-full"
										/>
									</FormField>
								</div>

								{#if !calendarExists}
									<div
										class="bg-card rounded-lg border border-border p-3 sm:p-4 shadow-ink"
									>
										<FormField
											label="Calendar Description"
											hint="Brief description for the calendar"
										>
											<Textarea
												bind:value={formData.calendarDescription}
												placeholder="Tasks and events for {project?.name}"
												rows={3}
												class="w-full font-sans"
											/>
										</FormField>
									</div>
								{/if}

								<div
									class="bg-card rounded-lg border border-border p-3 sm:p-4 shadow-ink"
								>
									<div class="flex items-center gap-2 mb-2">
										<div class="p-1.5 bg-accent/10 rounded-lg">
											<Palette class="w-3.5 h-3.5 text-accent" />
										</div>
										<p class="text-sm font-semibold text-foreground">
											Calendar Color
										</p>
									</div>
									<p class="text-xs text-muted-foreground mb-3">
										Choose a color to identify this calendar
									</p>
									<div
										class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-12"
									>
										{#each Object.entries(GOOGLE_CALENDAR_COLORS) as [colorId, colorInfo]}
											<button
												type="button"
												onclick={() => selectColor(colorId)}
												class="group relative aspect-square w-full rounded-lg border-2 transition-all hover:scale-105 pressable {formData.selectedColorId ===
												colorId
													? 'border-foreground shadow-ink-strong ring-2 ring-offset-1 ring-accent/30 scale-105'
													: 'border-border hover:border-accent/50 hover:shadow-ink'}"
												style="background-color: {colorInfo.hex}"
												title="{colorInfo.name} ({colorId})"
												aria-label="Select {colorInfo.name} color"
											>
												{#if formData.selectedColorId === colorId}
													<Check
														class="absolute inset-0 m-auto h-3 w-3 sm:h-4 sm:w-4 {colorInfo.text ===
														'text-white'
															? 'text-white'
															: 'text-foreground'} drop-shadow-lg"
													/>
												{/if}
												<span class="sr-only">{colorInfo.name}</span>
											</button>
										{/each}
									</div>
									<div class="mt-2 text-center">
										<p
											class="text-[10px] uppercase tracking-wide text-muted-foreground"
										>
											Selected: <span class="font-semibold text-foreground"
												>{GOOGLE_CALENDAR_COLORS[formData.selectedColorId]
													?.name}</span
											>
										</p>
									</div>
								</div>

								<div
									class="bg-card rounded-lg border border-border p-3 sm:p-4 shadow-ink"
								>
									<FormField
										label="Project Sync Mode"
										hint="Choose how project event changes are projected to member calendars"
									>
										<select
											bind:value={formData.syncMode}
											class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
										>
											<option value="actor_projection"
												>Actor projection</option
											>
											<option value="member_fanout">Member fanout</option>
										</select>
									</FormField>
									<p class="mt-2 text-xs text-muted-foreground">
										Actor projection updates only the editor's linked calendar.
										Member fanout updates all members with linked, enabled
										calendars.
									</p>
								</div>

								{#if calendarExists}
									<div
										class="bg-card rounded-lg border border-border p-3 sm:p-4 shadow-ink"
									>
										<FormField label="Sync Settings">
											<label class="flex items-center gap-2 cursor-pointer">
												<input
													type="checkbox"
													bind:checked={formData.syncEnabled}
													class="h-4 w-4 rounded border-border text-accent focus:ring-accent/50 focus:ring-offset-0"
												/>
												<span class="text-sm text-foreground">
													Automatically sync events to this calendar
												</span>
											</label>
										</FormField>
									</div>
								{/if}
							</form>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="border-t border-border px-4 py-3 bg-card sm:px-5">
			{#if activeTab === 'settings'}
				<div class="flex items-center justify-between gap-2">
					{#if calendarExists}
						<Button
							type="button"
							onclick={deleteCalendar}
							disabled={deleting}
							variant="ghost"
							size="sm"
							class="text-destructive hover:text-destructive hover:bg-destructive/10"
						>
							{#if deleting}
								<LoaderCircle class="mr-1.5 h-3.5 w-3.5 animate-spin" />
							{:else}
								<Trash2 class="mr-1.5 h-3.5 w-3.5" />
							{/if}
							<span class="hidden sm:inline">Delete Calendar</span>
							<span class="sm:hidden">Delete</span>
						</Button>
					{:else}
						<div></div>
					{/if}

					<div class="flex gap-2">
						<Button
							type="button"
							onclick={handleClose}
							variant="outline"
							disabled={saving || deleting}
							size="sm"
						>
							Cancel
						</Button>
						<Button
							onclick={handleSubmit}
							variant="primary"
							disabled={saving || !formData.calendarName}
							size="sm"
							class="shadow-ink pressable"
						>
							{#if saving}
								<LoaderCircle class="mr-1.5 h-3.5 w-3.5 animate-spin" />
								Saving...
							{:else if calendarExists}
								Update
							{:else}
								Create
							{/if}
						</Button>
					</div>
				</div>
			{:else}
				<div class="flex justify-end">
					<Button type="button" onclick={handleClose} variant="outline" size="sm">
						Close
					</Button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>

{#if editingTaskId && project?.id}
	{#await loadTaskEditModal() then TaskEditModal}
		<TaskEditModal
			taskId={editingTaskId}
			projectId={project.id}
			onClose={closeTaskEditor}
			onUpdated={handleEditorUpdated}
			onDeleted={handleEditorUpdated}
		/>
	{/await}
{/if}

{#if editingEventId && project?.id}
	{#await loadEventEditModal() then EventEditModal}
		<EventEditModal
			eventId={editingEventId}
			projectId={project.id}
			onClose={closeEventEditor}
			onUpdated={handleEditorUpdated}
			onDeleted={handleEditorUpdated}
		/>
	{/await}
{/if}

<style>
	:global(.modal-content button),
	:global(.modal-content input),
	:global(.modal-content textarea),
	:global(.modal-content select) {
		transition: all 0.15s ease;
	}

	@media (max-width: 640px) {
		:global(.modal-content button:not(.aspect-square)) {
			min-height: 44px;
		}
	}
</style>
