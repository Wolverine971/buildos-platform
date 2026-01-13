<!-- apps/web/src/lib/components/project/ProjectCalendarSettingsModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		Calendar,
		Check,
		AlertCircle,
		LoaderCircle,
		Trash2,
		Palette,
		Settings
	} from 'lucide-svelte';
	import type { Database } from '@buildos/shared-types';
	import {
		GOOGLE_CALENDAR_COLORS,
		type GoogleColorId,
		DEFAULT_CALENDAR_COLOR
	} from '$lib/config/calendar-colors';
	import type { Project } from '$lib/types/onto';

	type ProjectCalendar = Database['public']['Tables']['project_calendars']['Row'];

	// Props using Svelte 5 $props() rune
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

	// State using Svelte 5 $state() rune
	let loading = $state(false);
	let saving = $state(false);
	let deleting = $state(false);
	let errors = $state<string[]>([]);

	// Calendar data
	let projectCalendar = $state<ProjectCalendar | null>(null);
	let calendarExists = $state(false);

	// Form fields
	let formData = $state({
		calendarName: '',
		calendarDescription: '',
		selectedColorId: DEFAULT_CALENDAR_COLOR as GoogleColorId,
		syncEnabled: true
	});

	// Derived state for default color from project props
	let defaultColorId = $derived.by(() => {
		const projectProps = (project?.props as Record<string, unknown> | null) ?? {};
		const calendarProps = (projectProps.calendar as Record<string, unknown> | null) ?? {};
		return (calendarProps.color_id || DEFAULT_CALENDAR_COLOR) as GoogleColorId;
	});

	// Load calendar settings when modal opens - using $effect instead of $:
	$effect(() => {
		if (browser && project && isOpen) {
			loadCalendarSettings();
		}
	});

	async function loadCalendarSettings() {
		if (!project?.id) return;

		loading = true;
		errors = [];

		try {
			const response = await fetch(`/api/onto/projects/${project.id}/calendar`);
			const result = await response.json();

			if (result.success && result.data) {
				// Calendar exists - use const for type narrowing
				const calendar = result.data;
				projectCalendar = calendar;
				calendarExists = true;
				formData = {
					calendarName: calendar.calendar_name,
					calendarDescription: '', // Not stored in DB currently
					selectedColorId: (calendar.color_id || DEFAULT_CALENDAR_COLOR) as GoogleColorId,
					syncEnabled: calendar.sync_enabled ?? true
				};
			} else {
				// No calendar exists yet, set defaults and reset state
				projectCalendar = null;
				calendarExists = false;
				formData = {
					calendarName: `${project.name} - Tasks`,
					calendarDescription:
						project.description || `Tasks and events for ${project.name}`,
					selectedColorId: defaultColorId,
					syncEnabled: true
				};
			}
		} catch (error) {
			console.error('Error loading calendar settings:', error);
			errors = ['Failed to load calendar settings'];
			// Reset state on error as well
			projectCalendar = null;
			calendarExists = false;
			formData = {
				calendarName: `${project.name} - Tasks`,
				calendarDescription: project.description || `Tasks and events for ${project.name}`,
				selectedColorId: defaultColorId,
				syncEnabled: true
			};
		} finally {
			loading = false;
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!project?.id) return;

		saving = true;
		errors = [];

		try {
			if (!calendarExists) {
				// Create new calendar
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
					projectCalendar = result.data;
					calendarExists = true;
					toastService.success('Project calendar created successfully');
					onCalendarCreated?.(result.data);
				} else {
					throw new Error(result.error || 'Failed to create calendar');
				}
			} else {
				// Update existing calendar
				const response = await fetch(`/api/onto/projects/${project.id}/calendar`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: formData.calendarName,
						colorId: formData.selectedColorId,
						syncEnabled: formData.syncEnabled
					})
				});

				const result = await response.json();
				if (result.success) {
					projectCalendar = result.data;
					toastService.success('Calendar settings updated');
					onCalendarUpdated?.(result.data);
				} else {
					throw new Error(result.error || 'Failed to update calendar');
				}
			}
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
				projectCalendar = null;
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

<Modal bind:isOpen onClose={handleClose}>
	{#snippet header()}
		<div class="px-4 py-3 border-b border-border sm:px-5 sm:py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2 sm:gap-3">
					<div class="p-2 bg-accent/10 rounded-lg">
						<Calendar class="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
					</div>
					<div>
						<h2 class="text-base sm:text-lg font-semibold text-foreground">
							Calendar Settings
						</h2>
						<p class="text-xs sm:text-sm text-muted-foreground">
							Manage Google Calendar for {project?.name || 'this project'}
						</p>
					</div>
				</div>
				<button
					type="button"
					onclick={handleClose}
					class="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground pressable"
					aria-label="Close modal"
				>
					<svg
						class="w-4 h-4 sm:w-5 sm:h-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						></path>
					</svg>
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<!-- Main content -->
		<div class="flex-1 overflow-y-auto bg-background tx tx-frame tx-weak">
			{#if loading}
				<div class="flex items-center justify-center py-12">
					<LoaderCircle class="h-6 w-6 animate-spin text-accent" />
				</div>
			{:else}
				<div class="p-4 space-y-3 sm:p-5 sm:space-y-4">
					<!-- Error display -->
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
						<!-- Calendar Status -->
						<div class="bg-card rounded-lg border border-border p-3 sm:p-4 shadow-ink">
							<div class="flex items-center justify-between gap-2">
								<div class="flex items-center gap-2 sm:gap-3">
									<div class="p-1.5 sm:p-2 bg-accent/10 rounded-lg">
										<Settings class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent" />
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

						<!-- Calendar Name -->
						<div class="bg-card rounded-lg border border-border p-3 sm:p-4 shadow-ink">
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
							<!-- Calendar Description (only for new calendars) -->
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

						<!-- Color Picker -->
						<div class="bg-card rounded-lg border border-border p-3 sm:p-4 shadow-ink">
							<div class="flex items-center gap-2 mb-2">
								<div class="p-1.5 bg-accent/10 rounded-lg">
									<Palette class="w-3.5 h-3.5 text-accent" />
								</div>
								<p class="text-sm font-semibold text-foreground">Calendar Color</p>
							</div>
							<p class="text-xs text-muted-foreground mb-3">
								Choose a color to identify this calendar
							</p>
							<div class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-12">
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

						{#if calendarExists}
							<!-- Sync Settings -->
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
	{/snippet}

	{#snippet footer()}
		<div class="border-t border-border px-4 py-3 bg-card sm:px-5">
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
		</div>
	{/snippet}
</Modal>

<style>
	/* INKPRINT: Smooth transitions */
	:global(.modal-content button),
	:global(.modal-content input),
	:global(.modal-content textarea),
	:global(.modal-content select) {
		transition: all 0.15s ease;
	}

	/* Mobile touch targets */
	@media (max-width: 640px) {
		:global(.modal-content button:not(.aspect-square)) {
			min-height: 44px;
		}
	}
</style>
