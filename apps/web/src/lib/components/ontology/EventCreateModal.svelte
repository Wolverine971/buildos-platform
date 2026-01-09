<!-- apps/web/src/lib/components/ontology/EventCreateModal.svelte -->
<script lang="ts">
	import { Calendar, Loader, Save } from 'lucide-svelte';
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

<Modal isOpen={true} {onClose} title="New Event" size="md">
	<form onsubmit={handleSubmit} class="space-y-4">
		<div class="flex items-center gap-2 text-sm text-muted-foreground">
			<Calendar class="w-4 h-4 text-accent" />
			<span>Schedule time tied to this project.</span>
		</div>

		<FormField label="Title" labelFor="eventTitle" required={true}>
			<TextInput id="eventTitle" bind:value={title} placeholder="Event title" size="md" />
		</FormField>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<FormField label="Start" labelFor="eventStart" required={true}>
				<TextInput id="eventStart" type="datetime-local" bind:value={startAt} size="md" />
			</FormField>
			<FormField label="End" labelFor="eventEnd">
				<TextInput id="eventEnd" type="datetime-local" bind:value={endAt} size="md" />
			</FormField>
		</div>

		<FormField label="Location" labelFor="eventLocation">
			<TextInput
				id="eventLocation"
				bind:value={location}
				placeholder="Optional location"
				size="md"
			/>
		</FormField>

		<FormField label="Description" labelFor="eventDescription">
			<Textarea
				id="eventDescription"
				bind:value={description}
				placeholder="Optional notes"
				rows={3}
			/>
		</FormField>

		{#if tasks.length > 0}
			<FormField label="Link to Task" labelFor="linkedTask">
				<Select id="linkedTask" bind:value={linkedTaskId} size="md">
					<option value="">No linked task</option>
					{#each tasks as task}
						<option value={task.id}>{task.title}</option>
					{/each}
				</Select>
			</FormField>
		{/if}

		<label class="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer group">
			<input
				type="checkbox"
				bind:checked={syncToCalendar}
				class="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
			/>
			<span class="group-hover:text-foreground transition-colors"
				>Sync to project calendar</span
			>
		</label>

		{#if error}
			<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
				<p class="text-xs text-destructive">{error}</p>
			</div>
		{/if}

		<div class="flex justify-end gap-2">
			<Button type="button" variant="ghost" on:click={onClose} disabled={isSaving}>
				Cancel
			</Button>
			<Button type="submit" variant="primary" disabled={isSaving}>
				{#if isSaving}
					<Loader class="w-4 h-4 animate-spin" />
				{:else}
					<Save class="w-4 h-4" />
				{/if}
				<span>Create</span>
			</Button>
		</div>
	</form>
</Modal>
