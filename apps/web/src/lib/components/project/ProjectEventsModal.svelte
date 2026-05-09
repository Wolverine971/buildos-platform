<!-- apps/web/src/lib/components/project/ProjectEventsModal.svelte -->
<script lang="ts">
	import { CalendarClock, Clock, ExternalLink, MapPin, Plus } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { OntoEvent } from '$lib/types/onto';

	type EventWithOptionalSync = OntoEvent & {
		onto_event_sync?: unknown[];
	};

	let {
		isOpen,
		events,
		canEdit,
		onClose,
		onAddEvent,
		onSelectEvent
	}: {
		isOpen: boolean;
		events: OntoEvent[];
		canEdit: boolean;
		onClose: () => void;
		onAddEvent?: () => void;
		onSelectEvent: (eventId: string) => void;
	} = $props();

	const eventStateAccents: Record<string, string> = {
		scheduled: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30',
		confirmed: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
		in_progress: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
		completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
		cancelled: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
	};

	function stateChip(
		state: string | null | undefined
	): { label: string; className: string } | null {
		if (!state) return null;
		return {
			label: state.replace(/_/g, ' '),
			className:
				eventStateAccents[state] ?? 'bg-muted/40 text-muted-foreground border-border/60'
		};
	}

	function sortEvents(list: OntoEvent[]): OntoEvent[] {
		return [...list].sort((a, b) => {
			const da = new Date(a.start_at).getTime();
			const db = new Date(b.start_at).getTime();
			return (Number.isFinite(da) ? da : Infinity) - (Number.isFinite(db) ? db : Infinity);
		});
	}

	function eventHasCalendarSync(event: OntoEvent): boolean {
		const syncRows = (event as EventWithOptionalSync).onto_event_sync ?? [];
		return (
			syncRows.length > 0 ||
			Boolean(event.external_link) ||
			Boolean(event.last_synced_at) ||
			Boolean(
				event.props?.external_event_id ||
					event.props?.external_calendar_id ||
					event.props?.external_link
			)
		);
	}

	function formatEventWindow(event: OntoEvent): string {
		if (!event.start_at) return 'No start time';
		const start = new Date(event.start_at);
		if (Number.isNaN(start.getTime())) return 'No start time';
		if (event.all_day) {
			return start.toLocaleDateString(undefined, {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			});
		}
		const dateLabel = start.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
		const startTime = start.toLocaleTimeString(undefined, {
			hour: 'numeric',
			minute: '2-digit'
		});
		if (!event.end_at) return `${dateLabel} / ${startTime}`;
		const end = new Date(event.end_at);
		if (Number.isNaN(end.getTime())) return `${dateLabel} / ${startTime}`;
		const endTime = end.toLocaleTimeString(undefined, {
			hour: 'numeric',
			minute: '2-digit'
		});
		if (start.toDateString() === end.toDateString()) {
			return `${dateLabel} / ${startTime}-${endTime}`;
		}
		return `${dateLabel} / ${startTime} -> ${end.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		})}`;
	}

	function formatEventMeta(event: OntoEvent): string {
		const parts: string[] = [];
		if (event.owner_entity_type && event.owner_entity_type !== 'project') {
			parts.push(event.owner_entity_type.replace(/_/g, ' '));
		}
		parts.push(eventHasCalendarSync(event) ? 'synced' : 'local');
		return parts.join(' / ');
	}
</script>

<Modal {isOpen} {onClose} title="Events" size="lg" ariaLabel="Project events">
	<div class="p-3 sm:p-4 space-y-3">
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-2 min-w-0 text-xs text-muted-foreground">
				<CalendarClock class="w-4 h-4 shrink-0 text-teal-500" />
				<span>{events.length} {events.length === 1 ? 'event' : 'events'}</span>
			</div>
			{#if canEdit && onAddEvent}
				<button
					type="button"
					onclick={onAddEvent}
					class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-ink transition-colors hover:bg-muted/50 pressable"
				>
					<Plus class="w-3.5 h-3.5" />
					<span>New event</span>
				</button>
			{/if}
		</div>

		{#if events.length === 0}
			<div class="rounded-lg border border-border bg-card px-3 py-8 text-center">
				<p class="text-sm text-muted-foreground">No events scheduled.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-2">
				{#each sortEvents(events) as event (event.id)}
					{@const chip = stateChip(event.state_key)}
					{@const meta = formatEventMeta(event)}
					<button
						type="button"
						onclick={() => onSelectEvent(event.id)}
						class="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left shadow-ink transition-colors hover:bg-muted/40 pressable"
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2 min-w-0">
									<Clock class="w-3.5 h-3.5 shrink-0 text-teal-500" />
									<p class="text-sm font-medium text-foreground line-clamp-1">
										{event.title}
									</p>
								</div>
								<p class="mt-1 text-xs text-muted-foreground line-clamp-1">
									{formatEventWindow(event)}
								</p>
								{#if event.description}
									<p class="mt-1 text-xs text-muted-foreground/80 line-clamp-2">
										{event.description}
									</p>
								{/if}
								<div class="mt-2 flex flex-wrap items-center gap-1.5">
									{#if chip}
										<span
											class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium {chip.className}"
											>{chip.label}</span
										>
									{/if}
									{#if event.location}
										<span
											class="inline-flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground"
										>
											<MapPin class="w-2.5 h-2.5 shrink-0" />
											<span class="truncate">{event.location}</span>
										</span>
									{/if}
									<span class="text-[10px] text-muted-foreground">{meta}</span>
								</div>
							</div>
							<ExternalLink
								class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70"
							/>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</Modal>
