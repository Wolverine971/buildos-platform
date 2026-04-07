<!-- apps/web/src/lib/components/ontology/EventEditModal.svelte -->
<!--
	Event Edit Modal Component

	Provides full CRUD operations for events within the BuildOS ontology system:
	- Edit event details (title, description, location, dates)
	- Calendar sync options
	- Delete events with confirmation
	- LinkedEntities for connecting to tasks, goals, plans, etc.

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Modal Design Patterns: /apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md

	Related Files:
	- API Endpoints: /apps/web/src/routes/api/onto/events/[id]/+server.ts
	- Create Modal: /apps/web/src/lib/components/ontology/EventCreateModal.svelte
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { format } from 'date-fns';
	import {
		Loader,
		Save,
		Trash2,
		Calendar,
		X,
		ExternalLink,
		ChevronDown,
		FileText
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import EntityActivityLog from './EntityActivityLog.svelte';
	import EntityCommentsSection from './EntityCommentsSection.svelte';
	import ImageAssetsPanel from './ImageAssetsPanel.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { EntityKind } from './linked-entities/linked-entities.types';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	// Lazy-loaded modal components for linked entity navigation

	type TaskEditModalLazy = typeof import('./TaskEditModal.svelte').default | null;
	type GoalEditModalLazy = typeof import('./GoalEditModal.svelte').default | null;
	type PlanEditModalLazy = typeof import('./PlanEditModal.svelte').default | null;
	type DocumentModalLazy = typeof import('./DocumentModal.svelte').default | null;
	let TaskEditModalComponent = $state<TaskEditModalLazy>(null);
	let GoalEditModalComponent = $state<GoalEditModalLazy>(null);
	let PlanEditModalComponent = $state<PlanEditModalLazy>(null);
	let DocumentModalComponent = $state<DocumentModalLazy>(null);

	async function loadTaskEditModal() {
		if (!TaskEditModalComponent) {
			const mod = await import('./TaskEditModal.svelte');
			TaskEditModalComponent = mod.default;
		}
		return TaskEditModalComponent;
	}

	async function loadGoalEditModal() {
		if (!GoalEditModalComponent) {
			const mod = await import('./GoalEditModal.svelte');
			GoalEditModalComponent = mod.default;
		}
		return GoalEditModalComponent;
	}

	async function loadPlanEditModal() {
		if (!PlanEditModalComponent) {
			const mod = await import('./PlanEditModal.svelte');
			PlanEditModalComponent = mod.default;
		}
		return PlanEditModalComponent;
	}

	async function loadDocumentModal() {
		if (!DocumentModalComponent) {
			const mod = await import('./DocumentModal.svelte');
			DocumentModalComponent = mod.default;
		}
		return DocumentModalComponent;
	}

	interface Props {
		eventId: string;
		projectId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { eventId, projectId, onClose, onUpdated, onDeleted }: Props = $props();

	let modalOpen = $state(true);
	let event = $state<any>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);
	let hasCalendarLink = $state(false);
	let deleteFromCalendar = $state(true);

	// Form fields
	let title = $state('');
	let description = $state('');
	let location = $state('');
	let startAt = $state('');
	let endAt = $state('');
	let allDay = $state(false);
	let syncToCalendar = $state(true);

	let showActivityLog = $state(false);

	// Track which date field was last modified by user interaction (not programmatic changes)
	let dateFieldLastChanged = $state<'start' | 'end' | null>(null);

	// Modal states for linked entity navigation
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);
	let showGoalModal = $state(false);
	let selectedGoalIdForModal = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanIdForModal = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let selectedDocumentIdForModal = $state<string | null>(null);

	const detailsFormId = $derived(`event-edit-${eventId}-details`);

	// Load event data when modal opens
	$effect(() => {
		if (!browser) return;
		if (eventId) {
			loadEvent();
		}
	});

	// Bidirectional date adjustment: when user changes one date to create an invalid range,
	// intelligently adjust the OTHER date to maintain a 30-minute minimum duration
	$effect(() => {
		// Only run when user has explicitly changed a date field
		if (!dateFieldLastChanged) return;

		const startDate = startAt ? new Date(startAt) : null;
		const endDate = endAt ? new Date(endAt) : null;

		// Validate dates
		const validStart = startDate && !isNaN(startDate.getTime());
		const validEnd = endDate && !isNaN(endDate.getTime());

		// Reset flag before making changes to prevent loops
		const changedField = dateFieldLastChanged;
		dateFieldLastChanged = null;

		const THIRTY_MINUTES = 30 * 60 * 1000;

		if (changedField === 'start' && validStart) {
			// User changed start date
			if (!validEnd || startDate >= endDate) {
				// End is missing or start is at/after end: move end to 30 min after start
				const newEndDate = new Date(startDate.getTime() + THIRTY_MINUTES);
				endAt = format(newEndDate, "yyyy-MM-dd'T'HH:mm");
			}
		} else if (changedField === 'end' && validEnd) {
			// User changed end date
			if (!validStart) {
				// No start date: set start to 30 min before end
				const newStartDate = new Date(endDate.getTime() - THIRTY_MINUTES);
				startAt = format(newStartDate, "yyyy-MM-dd'T'HH:mm");
			} else if (validStart && endDate <= startDate) {
				// End is at/before start: move start to 30 min before end
				const newStartDate = new Date(endDate.getTime() - THIRTY_MINUTES);
				startAt = format(newStartDate, "yyyy-MM-dd'T'HH:mm");
			}
		}
	});

	// Event handlers to track user-initiated date changes
	function handleStartDateChange() {
		dateFieldLastChanged = 'start';
	}

	function handleEndDateChange() {
		dateFieldLastChanged = 'end';
	}

	function formatDateTimeForInput(date: string | null | undefined): string {
		if (!date) return '';
		try {
			const dateObj = new Date(date);
			if (isNaN(dateObj.getTime())) return '';
			return format(dateObj, "yyyy-MM-dd'T'HH:mm");
		} catch (err) {
			console.warn('Failed to format datetime for input:', date, err);
			return '';
		}
	}

	function parseDateTimeFromInput(value: string): string | null {
		if (!value) return null;
		try {
			const date = new Date(value);
			if (isNaN(date.getTime())) return null;
			return date.toISOString();
		} catch (err) {
			console.warn('Failed to parse datetime from input:', value, err);
			return null;
		}
	}

	async function loadEvent() {
		if (!eventId) return;
		isLoading = true;
		error = '';

		try {
			const response = await fetch(`/api/onto/events/${eventId}`);
			const result = await response.json();

			if (!response.ok) {
				throw new Error(result?.error || 'Failed to load event');
			}

			event = result?.data?.event;
			if (!event) {
				throw new Error('Event not found');
			}

			title = event.title || '';
			description = event.description || '';
			location = event.location || '';
			startAt = formatDateTimeForInput(event.start_at);
			endAt = formatDateTimeForInput(event.end_at);
			allDay = event.all_day || false;
			const syncRows = event.onto_event_sync || [];
			const props = event.props || {};
			hasCalendarLink =
				syncRows.length > 0 ||
				Boolean(props.external_event_id || props.external_calendar_id);
		} catch (err) {
			console.error('Error loading event:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/events/${eventId}`,
				method: 'GET',
				projectId,
				entityType: 'event',
				entityId: eventId ?? undefined,
				operation: 'event_load'
			});
			error = err instanceof Error ? err.message : 'Failed to load event';
		} finally {
			isLoading = false;
		}
	}

	function handleClose() {
		modalOpen = false;
		onClose();
	}

	async function handleSave(e: Event) {
		e.preventDefault();
		if (!title.trim()) {
			error = 'Event title is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const requestBody = {
				title: title.trim(),
				description: description.trim() || null,
				location: location.trim() || null,
				start_at: parseDateTimeFromInput(startAt),
				end_at: parseDateTimeFromInput(endAt),
				all_day: allDay,
				sync_to_calendar: syncToCalendar
			};

			const response = await fetch(`/api/onto/events/${eventId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result?.error || 'Failed to update event');
			}

			toastService.success('Event updated');
			onUpdated?.();
			handleClose();
		} catch (err) {
			console.error('Error updating event:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/events/${eventId}`,
				method: 'PATCH',
				projectId,
				entityType: 'event',
				entityId: eventId ?? undefined,
				operation: 'event_update'
			});
			error = err instanceof Error ? err.message : 'Failed to update event';
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete() {
		isDeleting = true;
		error = '';

		try {
			const response = await fetch(`/api/onto/events/${eventId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sync_to_calendar: deleteFromCalendar })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result?.error || 'Failed to delete event');
			}

			toastService.success('Event deleted');
			onDeleted?.();
			handleClose();
		} catch (err) {
			console.error('Error deleting event:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/events/${eventId}`,
				method: 'DELETE',
				projectId,
				entityType: 'event',
				entityId: eventId ?? undefined,
				operation: 'event_delete'
			});
			error = err instanceof Error ? err.message : 'Failed to delete event';
		} finally {
			isDeleting = false;
			showDeleteConfirm = false;
		}
	}

	// Linked entity modal handlers
	async function openTaskModal(id: string) {
		await loadTaskEditModal();
		selectedTaskIdForModal = id;
		showTaskModal = true;
	}

	async function openGoalModal(id: string) {
		await loadGoalEditModal();
		selectedGoalIdForModal = id;
		showGoalModal = true;
	}

	async function openPlanModal(id: string) {
		await loadPlanEditModal();
		selectedPlanIdForModal = id;
		showPlanModal = true;
	}

	async function openDocumentModal(id: string) {
		await loadDocumentModal();
		selectedDocumentIdForModal = id;
		showDocumentModal = true;
	}

	function handleLinkedEntityModalClose() {
		showTaskModal = false;
		showGoalModal = false;
		showPlanModal = false;
		showDocumentModal = false;
		selectedTaskIdForModal = null;
		selectedGoalIdForModal = null;
		selectedPlanIdForModal = null;
		selectedDocumentIdForModal = null;
		// Reload event in case links changed
		loadEvent();
	}

	function handleLinkedEntityClick(kind: EntityKind, id: string) {
		switch (kind) {
			case 'task':
				openTaskModal(id);
				break;
			case 'goal':
				openGoalModal(id);
				break;
			case 'plan':
				openPlanModal(id);
				break;
			case 'document':
				openDocumentModal(id);
				break;
			default:
				console.log(`No modal handler for entity kind: ${kind}`);
		}
	}
</script>

<Modal
	bind:isOpen={modalOpen}
	size="xl"
	onClose={handleClose}
	closeOnEscape={!isSaving}
	showCloseButton={false}
	customClasses="wt-plate"
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
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
						{title || event?.title || 'Event'}
					</h2>
					<div class="mt-1 flex flex-wrap items-center gap-1.5">
						{#if hasCalendarLink}
							<Badge variant="success" size="sm">Synced</Badge>
						{/if}
						{#if allDay}
							<Badge variant="accent" size="sm">All Day</Badge>
						{/if}
					</div>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-1">
						{#if event?.created_at}Created {new Date(
								event.created_at
							).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}{#if event?.updated_at && event.updated_at !== event.created_at}
							· Updated {new Date(event.updated_at).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<!-- External link if synced to calendar -->
				{#if hasCalendarLink && event?.props?.external_link}
					<a
						href={event.props.external_link}
						target="_blank"
						rel="noopener noreferrer"
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring tx tx-grain tx-weak"
						title="Open in Calendar"
					>
						<ExternalLink class="w-5 h-5" />
					</a>
				{/if}
				<!-- Close button -->
				<button
					type="button"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-red-500/50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak dark:hover:border-red-400/50 dark:hover:text-red-400"
					aria-label="Close modal"
				>
					<X class="w-5 h-5" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<!-- Main content -->
		<div class="px-2 py-2 sm:px-4 sm:py-4">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			{:else if !event}
				<div class="text-center py-8">
					<p class="text-destructive">Event not found</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
					<!-- Main Form (Left 2 columns) -->
					<div class="lg:col-span-2">
						<form
							id={detailsFormId}
							onsubmit={handleSave}
							class="space-y-3 sm:space-y-4"
						>
							<Card variant="elevated" class="wt-paper">
								<CardHeader variant="accent" texture="strip">
									<div
										class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
									>
										<div class="min-w-0">
											<div class="flex items-center gap-2">
												<FileText class="h-4 w-4 text-accent" />
												<p
													class="text-xs font-semibold uppercase tracking-[0.18em] text-accent"
												>
													Event Details
												</p>
											</div>
											<h3 class="mt-1 text-sm font-semibold text-foreground">
												What this event is about
											</h3>
											<p class="mt-1 text-xs text-muted-foreground">
												Title, description, and location for the event.
											</p>
										</div>
										<div class="flex flex-wrap items-center gap-1.5">
											{#if hasCalendarLink}
												<Badge variant="success" size="sm"
													>Synced</Badge
												>
											{/if}
										</div>
									</div>
								</CardHeader>
								<CardBody class="space-y-4">
									<FormField
										label="Event Title"
										labelFor="title"
										required={true}
										uppercase={false}
										showOptional={false}
										error={!title.trim() && error
											? 'Event title is required'
											: ''}
									>
										<TextInput
											id="title"
											bind:value={title}
											inputmode="text"
											enterkeyhint="next"
											placeholder="Enter event title..."
											required={true}
											disabled={isSaving}
											error={!title.trim() && error ? true : false}
										/>
									</FormField>

									<FormField
										label="Description"
										labelFor="description"
										uppercase={false}
										showOptional={false}
									>
										<Textarea
											id="description"
											bind:value={description}
											enterkeyhint="next"
											placeholder="Describe the event..."
											rows={3}
											disabled={isSaving}
											size="md"
										/>
									</FormField>

									<FormField
										label="Location"
										labelFor="location"
										uppercase={false}
										showOptional={false}
									>
										<TextInput
											id="location"
											bind:value={location}
											inputmode="text"
											enterkeyhint="next"
											placeholder="Enter location or meeting link..."
											disabled={isSaving}
										/>
									</FormField>
								</CardBody>
							</Card>

							<Card variant="default" class="wt-paper">
								<CardHeader variant="transparent" texture="none">
									<div
										class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
									>
										<div>
											<div class="flex items-center gap-2">
												<Calendar
													class="h-4 w-4 text-muted-foreground"
												/>
												<p
													class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
												>
													Schedule & Sync
												</p>
											</div>
											<h3 class="mt-1 text-sm font-semibold text-foreground">
												Time, duration, and calendar options
											</h3>
										</div>
									</div>
								</CardHeader>
								<CardBody class="space-y-4">
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
										<FormField
											label="Start"
											labelFor="start-date"
											required={true}
											uppercase={false}
											showOptional={false}
										>
											<TextInput
												id="start-date"
												type="datetime-local"
												inputmode="numeric"
												enterkeyhint="next"
												bind:value={startAt}
												oninput={handleStartDateChange}
												disabled={isSaving}
												size="sm"
												required={true}
											/>
										</FormField>

										<FormField
											label="End"
											labelFor="end-date"
											uppercase={false}
											showOptional={false}
										>
											<TextInput
												id="end-date"
												type="datetime-local"
												inputmode="numeric"
												enterkeyhint="done"
												bind:value={endAt}
												oninput={handleEndDateChange}
												disabled={isSaving}
												size="sm"
											/>
										</FormField>
									</div>

									<div class="space-y-2">
										<label
											class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer group"
										>
											<input
												type="checkbox"
												bind:checked={allDay}
												class="h-4 w-4 rounded border-border text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
											/>
											<span
												class="group-hover:text-foreground transition-colors"
												>All-day event</span
											>
										</label>

										<label
											class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer group"
										>
											<input
												type="checkbox"
												bind:checked={syncToCalendar}
												class="h-4 w-4 rounded border-border text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
											/>
											<span
												class="group-hover:text-foreground transition-colors"
											>
												Sync changes to calendar
												{#if hasCalendarLink}
													<span
														class="text-xs text-accent ml-1"
														>(linked)</span
													>
												{/if}
											</span>
										</label>
									</div>
								</CardBody>
							</Card>

							{#if error}
								<div
									class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 shadow-ink-inner"
								>
									<p class="text-sm text-destructive">{error}</p>
								</div>
							{/if}
						</form>
					</div>

					<!-- Sidebar (Right column) -->
					<div class="space-y-3">
						<Card variant="elevated" class="wt-card">
							<CardHeader variant="muted" texture="strip">
								<div class="flex items-center justify-between gap-3">
									<div>
										<p
											class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
										>
											At a glance
										</p>
										<h3 class="mt-1 text-sm font-semibold text-foreground">
											Event snapshot
										</h3>
									</div>
									{#if hasCalendarLink}
										<Badge variant="success" size="sm">Synced</Badge>
									{/if}
								</div>
							</CardHeader>
							<CardBody class="space-y-3">
								<div
									class="rounded-lg border border-border/70 bg-card p-3"
								>
									<div class="space-y-2">
										<p
											class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
										>
											Schedule
										</p>
										<div class="grid grid-cols-1 gap-1.5 text-xs">
											<div
												class="flex items-center justify-between gap-2"
											>
												<span class="text-muted-foreground">Start</span>
												<span class="text-right text-foreground">
													{startAt
														? new Date(startAt).toLocaleString(
																'en-US',
																{
																	weekday: 'short',
																	month: 'short',
																	day: 'numeric',
																	hour: 'numeric',
																	minute: '2-digit'
																}
															)
														: 'Not set'}
												</span>
											</div>
											<div
												class="flex items-center justify-between gap-2"
											>
												<span class="text-muted-foreground">End</span>
												<span class="text-right text-foreground">
													{endAt
														? new Date(endAt).toLocaleString(
																'en-US',
																{
																	weekday: 'short',
																	month: 'short',
																	day: 'numeric',
																	hour: 'numeric',
																	minute: '2-digit'
																}
															)
														: 'Not set'}
												</span>
											</div>
											{#if location}
												<div
													class="flex items-center justify-between gap-2"
												>
													<span class="text-muted-foreground"
														>Location</span
													>
													<span
														class="text-right text-foreground truncate max-w-[150px]"
														>{location}</span
													>
												</div>
											{/if}
										</div>
									</div>
								</div>

								<div
									class="rounded-lg border border-border/70 bg-muted/30 p-3"
								>
									<div class="grid grid-cols-1 gap-1.5 text-xs">
										<div
											class="flex items-center justify-between gap-2"
										>
											<span class="text-muted-foreground">Created</span>
											<span class="text-right text-foreground">
												{event.created_at
													? new Date(
															event.created_at
														).toLocaleDateString(undefined, {
															month: 'short',
															day: 'numeric',
															year: 'numeric'
														})
													: '—'}
											</span>
										</div>
										<div
											class="flex items-center justify-between gap-2"
										>
											<span class="text-muted-foreground">Updated</span>
											<span class="text-right text-foreground">
												{event.updated_at
													? new Date(
															event.updated_at
														).toLocaleDateString(undefined, {
															month: 'short',
															day: 'numeric',
															year: 'numeric'
														})
													: '—'}
											</span>
										</div>
									</div>
								</div>
							</CardBody>
						</Card>

						<!-- Linked Entities -->
						<LinkedEntities
							sourceId={eventId}
							sourceKind="event"
							{projectId}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={loadEvent}
						/>

						<!-- Images -->
						<ImageAssetsPanel
							{projectId}
							entityKind="event"
							entityId={eventId}
							title="Images"
							compact={true}
							onChanged={() => {
								void loadEvent();
								onUpdated?.();
							}}
						/>

						<!-- Activity Log (collapsible) -->
						<div
							class="border border-border rounded-lg bg-card shadow-ink overflow-hidden"
						>
							<button
								type="button"
								onclick={() => (showActivityLog = !showActivityLog)}
								class="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:bg-muted/50 transition-colors"
							>
								<span>Activity</span>
								<ChevronDown
									class="w-3.5 h-3.5 transition-transform {showActivityLog
										? 'rotate-180'
										: ''}"
								/>
							</button>
							{#if showActivityLog}
								<div class="border-t border-border">
									<EntityActivityLog
										entityType="event"
										entityId={eventId}
										autoLoad={true}
									/>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="mt-4">
					<EntityCommentsSection
						{projectId}
						entityType="event"
						entityId={eventId}
					/>
				</div>
			{/if}
		</div>
	{/snippet}

	<!-- Footer Actions -->
	{#snippet footer()}
		{#if !isLoading && event}
		<div
			class="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-t border-border bg-muted/50"
		>
			<div class="flex items-center gap-1">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => (showDeleteConfirm = true)}
					disabled={isDeleting || isSaving}
					class="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2 h-8 pressable"
				>
					<Trash2 class="w-3.5 h-3.5" />
					<span class="hidden sm:inline ml-1">Delete</span>
				</Button>
			</div>
			<div class="flex items-center gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
					class="text-xs h-8 pressable"
				>
					Cancel
				</Button>
				<Button
					type="submit"
					form={detailsFormId}
					variant="primary"
					size="sm"
					loading={isSaving}
					disabled={isSaving || isDeleting || !title.trim()}
					class="text-xs h-8 pressable"
				>
					<Save class="w-3.5 h-3.5" />
					<span class="ml-1">Save</span>
				</Button>
			</div>
		</div>
		{/if}
	{/snippet}
</Modal>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
	<ConfirmationModal
		isOpen={showDeleteConfirm}
		title="Delete Event"
		confirmText={deleteFromCalendar ? 'Delete + Calendar' : 'Delete only here'}
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		onconfirm={handleDelete}
		oncancel={() => (showDeleteConfirm = false)}
	>
		{#snippet content()}
			<div class="space-y-3">
				<p class="text-sm text-muted-foreground">
					This action cannot be undone. The event will be permanently deleted from
					BuildOS.
				</p>
				{#if hasCalendarLink}
					<label
						class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer group"
					>
						<input
							type="checkbox"
							bind:checked={deleteFromCalendar}
							class="h-4 w-4 rounded border-border text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
						/>
						<span class="group-hover:text-foreground transition-colors">
							Also delete from linked calendar
						</span>
					</label>
				{:else}
					<p class="text-xs text-muted-foreground italic">
						No linked calendar event found.
					</p>
				{/if}
			</div>
		{/snippet}
	</ConfirmationModal>
{/if}

<!-- Linked Entity Modals (Lazy Loaded) -->
{#if showTaskModal && selectedTaskIdForModal && TaskEditModalComponent}
	{@const TaskModal = TaskEditModalComponent}
	<TaskModal
		taskId={selectedTaskIdForModal}
		{projectId}
		onClose={handleLinkedEntityModalClose}
		onUpdated={handleLinkedEntityModalClose}
		onDeleted={handleLinkedEntityModalClose}
	/>
{/if}

{#if showGoalModal && selectedGoalIdForModal && GoalEditModalComponent}
	{@const GoalModal = GoalEditModalComponent}
	<GoalModal
		goalId={selectedGoalIdForModal}
		{projectId}
		onClose={handleLinkedEntityModalClose}
		onUpdated={handleLinkedEntityModalClose}
		onDeleted={handleLinkedEntityModalClose}
	/>
{/if}

{#if showPlanModal && selectedPlanIdForModal && PlanEditModalComponent}
	{@const PlanModal = PlanEditModalComponent}
	<PlanModal
		planId={selectedPlanIdForModal}
		{projectId}
		onClose={handleLinkedEntityModalClose}
		onUpdated={handleLinkedEntityModalClose}
		onDeleted={handleLinkedEntityModalClose}
	/>
{/if}

{#if showDocumentModal && selectedDocumentIdForModal && DocumentModalComponent}
	{@const DocModal = DocumentModalComponent}
	<DocModal
		{projectId}
		documentId={selectedDocumentIdForModal}
		isOpen={showDocumentModal}
		onClose={handleLinkedEntityModalClose}
		onSaved={handleLinkedEntityModalClose}
		onDeleted={handleLinkedEntityModalClose}
	/>
{/if}
