<!-- apps/web/src/lib/components/ontology/EventCreateModal.svelte -->
<!--
	Event Creation Modal Component
	Creates calendar events tied to a project.

	Related Files:
	- API Endpoint: /apps/web/src/routes/api/onto/projects/[id]/events/+server.ts
	- Edit Modal: /apps/web/src/lib/components/ontology/EventEditModal.svelte
-->
<script lang="ts">
	import { Calendar, Save, X } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import type { Task } from '$lib/types/onto';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	interface Props {
		projectId: string;
		tasks: Task[];
		onClose: () => void;
		onCreated?: (eventId: string) => void;
	}

	let { projectId, tasks, onClose, onCreated }: Props = $props();

	let title = $state('');
	let description = $state('');
	let location = $state('');
	let startAt = $state('');
	let endAt = $state('');
	let linkedTaskId = $state('');
	let syncToCalendar = $state(true);
	let isSaving = $state(false);
	let error = $state('');

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

	async function handleSubmit(event: Event): Promise<void> {
		event.preventDefault();

		if (!title.trim()) {
			error = 'Event title is required';
			return;
		}

		if (!startAt) {
			error = 'Start time is required';
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
				task_id: linkedTaskId || null,
				sync_to_calendar: syncToCalendar,
				calendar_scope: 'project'
			};

			const response = await fetch(`/api/onto/projects/${projectId}/events`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result?.error || 'Failed to create event');
			}

			if (onCreated) {
				onCreated(result.data?.event?.id);
			}

			onClose();
		} catch (err) {
			console.error('Error creating event:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/events`,
				method: 'POST',
				projectId,
				entityType: 'event',
				operation: 'event_create'
			});
			error = err instanceof Error ? err.message : 'Failed to create event';
			isSaving = false;
		}
	}
</script>

<Modal isOpen={true} {onClose} size="xl" closeOnEscape={!isSaving} showCloseButton={false}>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
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
						{title || 'New Event'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						Schedule time tied to this project
					</p>
				</div>
			</div>
			<button
				type="button"
				onclick={onClose}
				disabled={isSaving}
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-500/50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-red-400/50 dark:hover:text-red-400 tx tx-grain tx-weak"
				aria-label="Close modal"
			>
				<X class="w-5 h-5" />
			</button>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="px-2 py-2 sm:px-6 sm:py-4">
			<form onsubmit={handleSubmit} class="space-y-4">
				<!-- Event Title -->
				<FormField
					label="Event Title"
					labelFor="eventTitle"
					required={true}
					error={!title.trim() && error ? 'Event title is required' : ''}
				>
					<TextInput
						id="eventTitle"
						bind:value={title}
						placeholder="Enter event title..."
						inputmode="text"
						enterkeyhint="next"
						required={true}
						disabled={isSaving}
						error={!title.trim() && error ? true : false}
						size="md"
					/>
				</FormField>

				<!-- Date/Time Grid -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<FormField label="Start" labelFor="eventStart" required={true}>
						<TextInput
							id="eventStart"
							type="datetime-local"
							inputmode="numeric"
							enterkeyhint="next"
							bind:value={startAt}
							disabled={isSaving}
							size="md"
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
					</FormField>
					<FormField label="End" labelFor="eventEnd">
						<TextInput
							id="eventEnd"
							type="datetime-local"
							inputmode="numeric"
							enterkeyhint="next"
							bind:value={endAt}
							disabled={isSaving}
							size="md"
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
						{/if}
					</FormField>
				</div>

				<!-- Location -->
				<FormField label="Location" labelFor="eventLocation">
					<TextInput
						id="eventLocation"
						bind:value={location}
						placeholder="Enter location or meeting link..."
						inputmode="text"
						enterkeyhint="next"
						disabled={isSaving}
						size="md"
					/>
				</FormField>

				<!-- Description -->
				<FormField
					label="Description"
					labelFor="eventDescription"
					hint="Provide additional context about this event"
				>
					<Textarea
						id="eventDescription"
						bind:value={description}
						placeholder="Describe the event..."
						enterkeyhint="next"
						rows={3}
						disabled={isSaving}
						size="md"
					/>
				</FormField>

				{#if tasks.length > 0}
					<FormField label="Link to Task" labelFor="linkedTask">
						<Select
							id="linkedTask"
							bind:value={linkedTaskId}
							disabled={isSaving}
							size="md"
						>
							<option value="">No linked task</option>
							{#each tasks as task}
								<option value={task.id}>{task.title}</option>
							{/each}
						</Select>
					</FormField>
				{/if}

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
						Sync to project calendar
					</span>
				</label>

				{#if error}
					<div
						class="p-3 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak"
					>
						<p class="text-sm text-destructive">{error}</p>
					</div>
				{/if}
			</form>
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-end gap-2 sm:gap-3 px-2 py-2 sm:px-4 sm:py-3 border-t border-border bg-muted/30 tx tx-grain tx-weak"
		>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onclick={onClose}
				disabled={isSaving}
				class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
			>
				Cancel
			</Button>
			<Button
				type="submit"
				variant="primary"
				size="sm"
				disabled={isSaving || !title.trim()}
				onclick={handleSubmit}
				loading={isSaving}
				class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
			>
				<Save class="w-3 h-3 sm:w-4 sm:h-4" />
				<span class="hidden sm:inline">Create Event</span>
				<span class="sm:hidden">Create</span>
			</Button>
		</div>
	{/snippet}
</Modal>
