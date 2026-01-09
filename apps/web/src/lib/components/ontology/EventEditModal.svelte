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
	import { Loader, Save, Trash2, Calendar, X, ExternalLink } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { EntityKind } from './linked-entities/linked-entities.types';
	import type { Component } from 'svelte';

	// Lazy-loaded modal components for linked entity navigation

	type LazyComponent = Component<any, any, any> | null;
	let TaskEditModalComponent = $state<LazyComponent>(null);
	let GoalEditModalComponent = $state<LazyComponent>(null);
	let PlanEditModalComponent = $state<LazyComponent>(null);
	let DocumentModalComponent = $state<LazyComponent>(null);

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
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0"
				>
					<Calendar class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || event?.title || 'Event'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
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
		{#if isLoading}
			<div class="flex items-center justify-center py-16 px-6">
				<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		{:else if !event}
			<div class="text-center py-12 px-6">
				<p class="text-destructive">Event not found</p>
			</div>
		{:else}
			<div class="px-2 py-2 sm:px-6 sm:py-4">
				<!-- Two-column layout -->
				<form
					class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 p-2"
					id={detailsFormId}
					onsubmit={handleSave}
				>
					<!-- Main Form (Left 2 columns) -->
					<div class="lg:col-span-2 space-y-6">
						<!-- Event Title -->
						<FormField
							label="Event Title"
							labelFor="title"
							required={true}
							error={!title.trim() && error ? 'Event title is required' : ''}
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
								size="md"
							/>
						</FormField>

						<!-- Description -->
						<FormField
							label="Description"
							labelFor="description"
							hint="Provide additional context about this event"
						>
							<Textarea
								id="description"
								bind:value={description}
								enterkeyhint="next"
								placeholder="Describe the event..."
								rows={4}
								disabled={isSaving}
								size="md"
							/>
						</FormField>

						<!-- Location -->
						<FormField label="Location" labelFor="location">
							<TextInput
								id="location"
								bind:value={location}
								inputmode="text"
								enterkeyhint="next"
								placeholder="Enter location or meeting link..."
								disabled={isSaving}
								size="md"
							/>
						</FormField>

						<!-- All Day Toggle -->
						<label
							class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer group"
						>
							<input
								type="checkbox"
								bind:checked={allDay}
								class="h-4 w-4 rounded border-border text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
							/>
							<span class="group-hover:text-foreground transition-colors"
								>All-day event</span
							>
						</label>

						<!-- Calendar Sync Toggle -->
						<label
							class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer group"
						>
							<input
								type="checkbox"
								bind:checked={syncToCalendar}
								class="h-4 w-4 rounded border-border text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
							/>
							<span class="group-hover:text-foreground transition-colors">
								Sync changes to calendar
								{#if hasCalendarLink}
									<span class="text-xs text-green-600 dark:text-green-400 ml-1"
										>(linked)</span
									>
								{/if}
							</span>
						</label>

						{#if error}
							<div
								class="p-3 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak"
							>
								<p class="text-sm text-destructive">
									{error}
								</p>
							</div>
						{/if}
					</div>

					<!-- Sidebar (Right column) -->
					<div class="space-y-4">
						<!-- Schedule Card -->
						<Card variant="elevated">
							<CardHeader variant="accent">
								<h3
									class="text-xs font-semibold uppercase tracking-wide flex items-center gap-2"
								>
									<span class="text-base">📅</span>
									Schedule
								</h3>
							</CardHeader>
							<CardBody padding="sm">
								<div class="space-y-3">
									<div>
										<label
											for="sidebar-start-date"
											class="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5"
										>
											Start
										</label>
										<TextInput
											id="sidebar-start-date"
											type="datetime-local"
											inputmode="numeric"
											enterkeyhint="next"
											bind:value={startAt}
											disabled={isSaving}
											size="sm"
											required={true}
											class="border-border bg-card focus:ring-2 focus:ring-accent w-full"
										/>
										{#if startAt}
											<p class="mt-1.5 text-xs text-muted-foreground">
												{new Date(startAt).toLocaleString('en-US', {
													weekday: 'short',
													month: 'short',
													day: 'numeric',
													hour: 'numeric',
													minute: '2-digit'
												})}
											</p>
										{/if}
									</div>
									<div>
										<label
											for="sidebar-end-date"
											class="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5"
										>
											End
										</label>
										<TextInput
											id="sidebar-end-date"
											type="datetime-local"
											inputmode="numeric"
											enterkeyhint="done"
											bind:value={endAt}
											disabled={isSaving}
											size="sm"
											class="border-border bg-card focus:ring-2 focus:ring-accent w-full"
										/>
										{#if endAt}
											<p class="mt-1.5 text-xs text-muted-foreground">
												{new Date(endAt).toLocaleString('en-US', {
													weekday: 'short',
													month: 'short',
													day: 'numeric',
													hour: 'numeric',
													minute: '2-digit'
												})}
											</p>
										{:else}
											<p class="mt-1.5 text-xs text-muted-foreground italic">
												No end time set
											</p>
										{/if}
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
					</div>
				</form>
			</div>
		{/if}
	{/snippet}

	<!-- Footer Actions -->
	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-between gap-2 sm:gap-4 px-2 py-2 sm:px-4 sm:py-3 border-t border-border bg-muted/50"
		>
			<!-- Delete button -->
			<div class="flex items-center gap-1.5 sm:gap-2">
				<Button
					type="button"
					variant="danger"
					size="sm"
					onclick={() => (showDeleteConfirm = true)}
					disabled={isDeleting || isSaving}
					class="text-[10px] sm:text-xs px-2 py-1 sm:px-3 sm:py-1.5 tx tx-grain tx-weak"
					icon={Trash2}
				>
					<span class="hidden sm:inline">Delete</span>
					<span class="sm:hidden">Del</span>
				</Button>
			</div>

			<!-- Cancel and Save buttons on the right -->
			<div class="flex flex-row items-center gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
					class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
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
					class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
				>
					<Save class="w-3 h-3 sm:w-4 sm:h-4" />
					<span class="hidden sm:inline">Save</span>
					<span class="sm:hidden">Save</span>
				</Button>
			</div>
		</div>
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
