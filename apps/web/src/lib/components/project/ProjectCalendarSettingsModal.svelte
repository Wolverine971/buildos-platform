<!-- apps/web/src/lib/components/project/ProjectCalendarSettingsModal.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import RadioGroup from '$lib/components/ui/RadioGroup.svelte';
	import Radio from '$lib/components/ui/Radio.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		Calendar,
		Check,
		AlertCircle,
		Loader2,
		Share2,
		Trash2,
		Palette,
		RefreshCw,
		Users,
		Settings
	} from 'lucide-svelte';
	import type { Database } from '@buildos/shared-types';
	import {
		GOOGLE_CALENDAR_COLORS,
		type GoogleColorId,
		DEFAULT_CALENDAR_COLOR
	} from '$lib/config/calendar-colors';
	import type { Project } from '$lib/types/project';

	type ProjectCalendar = Database['public']['Tables']['project_calendars']['Row'];

	export let isOpen = false;
	export let project: Project | null;

	const dispatch = createEventDispatcher();

	// State
	let loading = false;
	let saving = false;
	let deleting = false;
	let syncing = false;
	let errors: string[] = [];

	// Calendar data
	let projectCalendar: ProjectCalendar | null = null;
	let calendarExists = false;

	// Form fields
	let formData = {
		calendarName: '',
		calendarDescription: '',
		selectedColorId: DEFAULT_CALENDAR_COLOR as GoogleColorId,
		syncEnabled: true
	};

	// Share settings
	let shareEmail = '';
	let shareRole: 'reader' | 'writer' = 'reader';
	let shares: Array<{ email: string; role: 'reader' | 'writer' }> = [];

	// Initialize form data when modal opens
	$: if (project && isOpen) {
		loadCalendarSettings();
	}

	async function loadCalendarSettings() {
		if (!project?.id) return;

		loading = true;
		errors = [];

		try {
			const response = await fetch(`/api/projects/${project.id}/calendar`);
			const result = await response.json();

			if (result.success && result.data) {
				// Calendar exists
				projectCalendar = result.data;
				calendarExists = true;
				formData = {
					calendarName: projectCalendar.calendar_name,
					calendarDescription: '', // Not stored in DB currently
					selectedColorId: (projectCalendar.color_id ||
						DEFAULT_CALENDAR_COLOR) as GoogleColorId,
					syncEnabled: projectCalendar.sync_enabled ?? true
				};
			} else {
				// No calendar exists yet, set defaults and reset state
				projectCalendar = null;
				calendarExists = false;
				formData = {
					calendarName: `${project.name} - Tasks`,
					calendarDescription:
						project.description || `Tasks and events for ${project.name}`,
					selectedColorId: (project.calendar_color_id ||
						DEFAULT_CALENDAR_COLOR) as GoogleColorId,
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
				selectedColorId: (project.calendar_color_id ||
					DEFAULT_CALENDAR_COLOR) as GoogleColorId,
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
				const response = await fetch(`/api/projects/${project.id}/calendar`, {
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
					dispatch('calendarCreated', projectCalendar);
				} else {
					throw new Error(result.error || 'Failed to create calendar');
				}
			} else {
				// Update existing calendar
				const response = await fetch(`/api/projects/${project.id}/calendar`, {
					method: 'PUT',
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
					dispatch('calendarUpdated', projectCalendar);
				} else {
					throw new Error(result.error || 'Failed to update calendar');
				}
			}
		} catch (error: any) {
			console.error('Error saving calendar:', error);
			errors = [error.message || 'Failed to save calendar settings'];
		} finally {
			saving = false;
		}
	}

	async function syncToCalendar() {
		if (!project?.id) return;

		syncing = true;
		try {
			const response = await fetch(`/api/projects/${project.id}/calendar/sync`, {
				method: 'POST'
			});

			const result = await response.json();
			if (result.success) {
				toastService.success(result.message || 'Tasks synced to calendar');
			} else {
				toastService.error(result.error || 'Failed to sync tasks');
			}
		} catch (error) {
			console.error('Error syncing to calendar:', error);
			toastService.error('Failed to sync tasks to calendar');
		} finally {
			syncing = false;
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
			const response = await fetch(`/api/projects/${project.id}/calendar`, {
				method: 'DELETE'
			});

			const result = await response.json();
			if (result.success) {
				projectCalendar = null;
				calendarExists = false;
				toastService.success('Calendar deleted successfully');
				dispatch('calendarDeleted');
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

	async function shareCalendar() {
		if (!shareEmail || !project?.id) return;

		try {
			const response = await fetch(`/api/projects/${project.id}/calendar/share`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					shares: [...shares, { email: shareEmail, role: shareRole }]
				})
			});

			const result = await response.json();
			if (result.success) {
				shares = [...shares, { email: shareEmail, role: shareRole }];
				shareEmail = '';
				toastService.success('Calendar shared successfully');
			} else {
				toastService.error(result.error || 'Failed to share calendar');
			}
		} catch (error) {
			console.error('Error sharing calendar:', error);
			toastService.error('Failed to share calendar');
		}
	}

	function handleClose() {
		isOpen = false;
		dispatch('close');
	}
</script>

<Modal bind:isOpen onClose={handleClose}>
	<!-- Header slot -->
	<div slot="header" class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<div
					class="p-2.5 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-xl"
				>
					<Calendar class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
				</div>
				<div>
					<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
						Calendar Settings
					</h2>
					<p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
						Manage Google Calendar integration for {project?.name || 'this project'}
					</p>
				</div>
			</div>
			<button
				type="button"
				onclick={handleClose}
				class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
	</div>

	<!-- Main content -->
	<div class="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900/30">
		{#if loading}
			<div class="flex items-center justify-center py-16">
				<Loader2 class="h-8 w-8 animate-spin text-indigo-500" />
			</div>
		{:else}
			<div class="p-6 space-y-5">
				<!-- Error display -->
				{#if errors.length > 0}
					<div
						class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl"
					>
						<div class="flex items-start gap-3">
							<AlertCircle
								class="h-5 w-5 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0"
							/>
							<div class="flex-1">
								<h3 class="text-sm font-semibold text-red-800 dark:text-red-300">
									Error with calendar settings
								</h3>
								<div class="mt-1 text-sm text-red-700 dark:text-red-400">
									<ul class="list-disc space-y-1 pl-5">
										{#each errors as error}
											<li>{error}</li>
										{/each}
									</ul>
								</div>
							</div>
						</div>
					</div>
				{/if}

				<form onsubmit={handleSubmit} class="space-y-5">
					<!-- Calendar Status -->
					<div
						class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm"
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div
									class="p-2 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-lg"
								>
									<Settings
										class="h-4 w-4 text-indigo-600 dark:text-indigo-400"
									/>
								</div>
								<div>
									<p class="font-semibold text-gray-900 dark:text-white">
										Calendar Status
									</p>
									<p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
										{calendarExists
											? 'Connected to Google Calendar'
											: 'No calendar created yet'}
									</p>
								</div>
							</div>
							{#if calendarExists}
								<div
									class="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm font-medium text-green-700 dark:text-green-400"
								>
									<Check class="h-3.5 w-3.5" />
									Connected
								</div>
							{:else}
								<div
									class="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400"
								>
									<AlertCircle class="h-3.5 w-3.5" />
									Not connected
								</div>
							{/if}
						</div>
					</div>

					<!-- Calendar Name -->
					<div
						class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm"
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
						<!-- Calendar Description (only for new calendars) -->
						<div
							class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm"
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
					<div
						class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm"
					>
						<div class="flex items-center gap-2.5 mb-3">
							<div
								class="p-1.5 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg"
							>
								<Palette class="w-4 h-4 text-purple-600 dark:text-purple-400" />
							</div>
							<label class="text-sm font-semibold text-gray-900 dark:text-white">
								Calendar Color
							</label>
						</div>
						<p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
							Choose a color to identify this calendar in Google Calendar
						</p>
						<div class="grid grid-cols-6 gap-2.5 sm:grid-cols-8 md:grid-cols-12">
							{#each Object.entries(GOOGLE_CALENDAR_COLORS) as [colorId, colorInfo]}
								<button
									type="button"
									onclick={() =>
										(formData.selectedColorId = colorId as GoogleColorId)}
									class="group relative aspect-square w-full rounded-xl border-2 transition-all hover:scale-110 {formData.selectedColorId ===
									colorId
										? 'border-gray-900 dark:border-white shadow-lg ring-2 ring-offset-2 ring-indigo-500/30 scale-105'
										: 'border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:shadow-md'}"
									style="background-color: {colorInfo.hex}"
									title="{colorInfo.name} ({colorId})"
									aria-label="Select {colorInfo.name} color"
								>
									{#if formData.selectedColorId === colorId}
										<Check
											class="absolute inset-0 m-auto h-4 w-4 sm:h-5 sm:w-5 {colorInfo.text ===
											'text-white'
												? 'text-white'
												: 'text-gray-900'} drop-shadow-lg font-bold"
										/>
									{/if}
									<span class="sr-only">{colorInfo.name}</span>
								</button>
							{/each}
						</div>
						<div class="mt-3 text-center">
							<p class="text-xs text-gray-500 dark:text-gray-400">
								Selected: <span class="font-medium"
									>{GOOGLE_CALENDAR_COLORS[formData.selectedColorId]?.name}</span
								>
							</p>
						</div>
					</div>

					{#if calendarExists}
						<!-- Sync Settings -->
						<div
							class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm"
						>
							<FormField label="Sync Settings">
								<label class="flex items-center gap-3 cursor-pointer">
									<input
										type="checkbox"
										bind:checked={formData.syncEnabled}
										class="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
									/>
									<span class="text-sm text-gray-700 dark:text-gray-300">
										Automatically sync tasks to this calendar
									</span>
								</label>
							</FormField>
						</div>

						<!-- Manual Sync -->
						<div
							class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm"
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<div
										class="p-2 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg"
									>
										<RefreshCw
											class="h-4 w-4 text-green-600 dark:text-green-400"
										/>
									</div>
									<div>
										<p class="font-semibold text-gray-900 dark:text-white">
											Manual Sync
										</p>
										<p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
											Sync all project tasks to the calendar now
										</p>
									</div>
								</div>
								<Button
									type="button"
									onclick={syncToCalendar}
									disabled={syncing}
									variant="outline"
									size="sm"
									class="min-w-[100px]"
								>
									{#if syncing}
										<Loader2 class="mr-2 h-4 w-4 animate-spin" />
										Syncing...
									{:else}
										Sync Now
									{/if}
								</Button>
							</div>
						</div>

						<!-- Share Calendar -->
						<div
							class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm"
						>
							<div class="flex items-center gap-2.5 mb-4">
								<div
									class="p-1.5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg"
								>
									<Users class="h-4 w-4 text-blue-600 dark:text-blue-400" />
								</div>
								<label class="text-sm font-semibold text-gray-900 dark:text-white">
									Share Calendar
								</label>
							</div>

							<div class="flex flex-col sm:flex-row gap-2">
								<TextInput
									type="email"
									bind:value={shareEmail}
									placeholder="Enter email address"
									class="flex-1"
								/>
								<Select bind:value={shareRole} class="sm:w-32">
									<option value="reader">View only</option>
									<option value="writer">Can edit</option>
								</Select>
								<Button
									type="button"
									onclick={shareCalendar}
									disabled={!shareEmail}
									size="sm"
									variant="outline"
									class="sm:w-auto"
								>
									<Share2 class="mr-2 h-4 w-4" />
									Share
								</Button>
							</div>

							{#if shares.length > 0}
								<div class="mt-4 space-y-2">
									<p
										class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Shared with
									</p>
									{#each shares as share}
										<div
											class="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 border border-gray-100 dark:border-gray-700"
										>
											<span class="text-sm text-gray-700 dark:text-gray-300">
												{share.email}
											</span>
											<span class="text-xs text-gray-500 dark:text-gray-400">
												{share.role === 'reader' ? 'View only' : 'Can edit'}
											</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</form>
			</div>
		{/if}
	</div>

	<!-- Footer slot -->
	<div
		slot="footer"
		class="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-white dark:bg-gray-800"
	>
		<div class="flex items-center justify-between">
			{#if calendarExists}
				<Button
					type="button"
					onclick={deleteCalendar}
					disabled={deleting}
					variant="ghost"
					size="sm"
					class="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
				>
					{#if deleting}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{:else}
						<Trash2 class="mr-2 h-4 w-4" />
					{/if}
					Delete Calendar
				</Button>
			{:else}
				<div />
			{/if}

			<div class="flex gap-3">
				<Button
					type="button"
					onclick={handleClose}
					variant="outline"
					disabled={saving || deleting}
					class="min-w-[80px]"
				>
					Cancel
				</Button>
				<Button
					onclick={handleSubmit}
					variant="primary"
					disabled={saving || !formData.calendarName}
					class="min-w-[140px] bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-sm"
				>
					{#if saving}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Saving...
					{:else if calendarExists}
						Update Settings
					{:else}
						Create Calendar
					{/if}
				</Button>
			</div>
		</div>
	</div>
</Modal>

<style>
	/* Smooth transitions for interactive elements */
	:global(.modal-content button),
	:global(.modal-content input),
	:global(.modal-content textarea),
	:global(.modal-content select) {
		transition: all 0.2s ease;
	}

	/* Focus states with brand colors */
	:global(.modal-content input:focus),
	:global(.modal-content textarea:focus),
	:global(.modal-content select:focus) {
		border-color: rgb(99, 102, 241) !important;
		box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1) !important;
	}

	:global(.dark .modal-content input:focus),
	:global(.dark .modal-content textarea:focus),
	:global(.dark .modal-content select:focus) {
		border-color: rgb(129, 140, 248) !important;
		box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.1) !important;
	}

	/* Enhanced shadow on hover for depth */
	:global(.modal-content form > div) {
		transition:
			box-shadow 0.2s ease,
			transform 0.2s ease;
	}

	:global(.modal-content form > div:hover) {
		box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.12);
		transform: translateY(-1px);
	}

	:global(.dark .modal-content form > div:hover) {
		box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.4);
	}

	/* Mobile optimizations */
	@media (max-width: 640px) {
		/* Ensure touch targets are at least 44px */
		:global(.modal-content button) {
			min-height: 44px;
		}

		/* Color picker buttons maintain aspect ratio */
		:global(.modal-content button.aspect-square) {
			min-height: auto;
		}
	}

	/* Smooth scrolling for modal content */
	:global(.modal-content) {
		scroll-behavior: smooth;
	}
</style>
