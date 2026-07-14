<!-- apps/web/src/lib/components/time-blocks/TimePlayCalendar.test-harness.svelte -->
<script lang="ts">
	import type { TimeBlockWithProject } from '@buildos/shared-types';
	import type { CalendarEvent } from '$lib/services/calendar-service';
	import TimePlayCalendar from './TimePlayCalendar.svelte';

	let {
		days,
		isCalendarConnected
	}: {
		days: Date[];
		isCalendarConnected: boolean;
	} = $props();

	let blocks = $state.raw<TimeBlockWithProject[]>([]);
	let calendarEvents = $state.raw<CalendarEvent[]>([]);

	function replaceBlocks() {
		blocks = [
			{
				id: 'block-1',
				calendar_event_id: 'buildos-event',
				start_time: '2026-07-13T09:00:00.000Z',
				end_time: '2026-07-13T10:00:00.000Z'
			} as TimeBlockWithProject
		];
	}
</script>

<button type="button" data-testid="replace-blocks" onclick={replaceBlocks}> Replace blocks </button>

<TimePlayCalendar
	{blocks}
	{days}
	{isCalendarConnected}
	viewMode="day"
	bind:calendarEventsOut={calendarEvents}
/>

<output data-testid="calendar-events-output">
	{calendarEvents.map((event) => event.summary).join('|')}
</output>
