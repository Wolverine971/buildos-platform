<!-- apps/web/src/lib/components/ontology/EventEditModal.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { format } from 'date-fns';
	import { Loader, Save, Trash2 } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';

	interface Props {
		eventId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { eventId, onClose, onUpdated, onDeleted }: Props = $props();

	let isLoading = $state(false);
	let isSaving = $state(false);
	let error = $state('');

	let title = $state('');
	let description = $state('');
	let location = $state('');
	let startAt = $state('');
	let endAt = $state('');
	let syncToCalendar = $state(true);

	function formatDateTimeForInput(date: string | null | undefined): string {
		if (!date) return '';
		try {
			const dateObj = new Date(date);
			if (isNaN(dateObj.getTime())) return '';
			return format(dateObj, "yyyy-MM-dd'T'HH:mm");
		} catch (error) {
			console.warn('Failed to format datetime for input:', date, error);
			return '';
		}
	}

	function parseDateTimeFromInput(value: string): string | null {
		if (!value) return null;
		try {
			const date = new Date(value);
			if (isNaN(date.getTime())) return null;
			return date.toISOString();
		} catch (error) {
			console.warn('Failed to parse datetime from input:', value, error);
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

			const event = result?.data?.event;
			if (!event) {
				throw new Error('Event not found');
			}

			title = event.title || '';
			description = event.description || '';
			location = event.location || '';
			startAt = formatDateTimeForInput(event.start_at);
			endAt = formatDateTimeForInput(event.end_at);
		} catch (err) {
			console.error('Error loading event:', err);
			error = err instanceof Error ? err.message : 'Failed to load event';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		loadEvent();
	});

	async function handleSubmit(event: Event): Promise<void> {
		event.preventDefault();
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

			if (onUpdated) {
				onUpdated();
			}

			onClose();
		} catch (err) {
			console.error('Error updating event:', err);
			error = err instanceof Error ? err.message : 'Failed to update event';
			isSaving = false;
		}
	}

	async function handleDelete(): Promise<void> {
		if (!confirm('Delete this event? This cannot be undone.')) return;
		isSaving = true;
		error = '';

		try {
			const response = await fetch(`/api/onto/events/${eventId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sync_to_calendar: syncToCalendar })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result?.error || 'Failed to delete event');
			}

			if (onDeleted) {
				onDeleted();
			}

			onClose();
		} catch (err) {
			console.error('Error deleting event:', err);
			error = err instanceof Error ? err.message : 'Failed to delete event';
			isSaving = false;
		}
	}
</script>

<Modal isOpen={true} {onClose} title="Edit Event" size="md">
	<form onsubmit={handleSubmit} class="space-y-4">
		{#if isLoading}
			<div class="flex items-center justify-center py-6 text-muted-foreground">
				<Loader class="w-4 h-4 animate-spin" />
				<span class="ml-2 text-sm">Loading event...</span>
			</div>
		{:else}
			<FormField label="Title" labelFor="eventTitle" required={true}>
				<TextInput id="eventTitle" bind:value={title} placeholder="Event title" size="md" />
			</FormField>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<FormField label="Start" labelFor="eventStart" required={true}>
					<TextInput
						id="eventStart"
						type="datetime-local"
						bind:value={startAt}
						size="md"
					/>
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

			<label
				class="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer group"
			>
				<input
					type="checkbox"
					bind:checked={syncToCalendar}
					class="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
				/>
				<span class="group-hover:text-foreground transition-colors">Sync to calendar</span>
			</label>

			{#if error}
				<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
					<p class="text-xs text-destructive">{error}</p>
				</div>
			{/if}

			<div class="flex justify-between gap-2">
				<Button type="button" variant="ghost" on:click={handleDelete} disabled={isSaving}>
					<Trash2 class="w-4 h-4" />
					<span>Delete</span>
				</Button>
				<div class="flex gap-2">
					<Button type="button" variant="ghost" on:click={onClose} disabled={isSaving}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={isSaving}>
						{#if isSaving}
							<Loader class="w-4 h-4 animate-spin" />
						{:else}
							<Save class="w-4 h-4" />
						{/if}
						<span>Save</span>
					</Button>
				</div>
			</div>
		{/if}
	</form>
</Modal>
